import { Router, type Response } from 'express';
import { getState, updateState } from './store';
import { runCodex } from './codex';
import { guidedPrompt, parseGuidedStep } from './guided';
import {
  currentQuestion,
  guidedActions,
  questionAssistance,
  type GuidedAction,
  type GuidedSession,
  type GuidedTurn,
} from '../shared/guided';
import type { Bootstrap } from '../shared/types';

function input(value: unknown, name: string, max: number, optional = false) {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim()))
    throw new Error(`${name}无效。`);
  return value.trim();
}
function id(value: unknown) {
  const result = input(value, '请求标识', 80);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(result)) throw new Error('请求标识无效。');
  return result;
}
function sessions() {
  const value = getState().guidedSessions;
  if (value !== undefined && !Array.isArray(value)) throw new Error('带学记录格式不兼容，请保留原数据。');
  return value ?? [];
}
function sessionById(value: unknown) {
  const session = sessions().find((s) => s.id === value);
  if (!session) throw new Error('没有找到这次带学记录。');
  return session;
}
function changeSession(sessionId: string, change: (session: GuidedSession) => void) {
  updateState((state) => {
    const session = state.guidedSessions?.find((s) => s.id === sessionId);
    if (!session) throw new Error('带学记录不存在。');
    change(session);
    session.updatedAt = new Date().toISOString();
    session.revision++;
  });
}

export function guidedRouter(snapshot: () => Bootstrap) {
  const router = Router();
  const running = new Map<string, AbortController>();

  async function generate(sessionId: string, turnId: string, res: Response) {
    const session = sessionById(sessionId);
    const turn = session.turns.find((t) => t.id === turnId)!;
    const course = getState().courses.find((c) => c.id === session.courseId)!;
    const lesson = course.lessons.find((l) => l.id === session.lessonId)!;
    const controller = new AbortController();
    running.set(sessionId, controller);
    const cancel = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', cancel);
    try {
      const preferences = getState().preferences;
      const output = await runCodex(
        guidedPrompt(course, lesson, session, turn, sessions()),
        controller.signal,
        preferences.codexModel,
        preferences,
      );
      if (controller.signal.aborted) throw new Error('本轮已停止，提交内容已保留，可以重试。');
      const response = parseGuidedStep(output, lesson, session, turn);
      changeSession(sessionId, (s) => {
        const saved = s.turns.find((t) => t.id === turnId)!;
        saved.response = response;
        saved.status = 'complete';
        delete saved.error;
      });
    } catch (error) {
      changeSession(sessionId, (s) => {
        const saved = s.turns.find((t) => t.id === turnId)!;
        saved.status = 'error';
        saved.error = error instanceof Error ? error.message : '导师暂时没有回应，可以重试。';
      });
    } finally {
      running.delete(sessionId);
      res.off('close', cancel);
    }
    if (!res.destroyed) res.json(snapshot());
  }

  router.get('/:id', (req, res) => {
    const session = sessionById(req.params.id);
    // A process restart must leave an explicit retry, never an endless spinner or replay.
    if (!running.has(session.id) && session.turns.some((t) => t.status === 'pending')) {
      changeSession(session.id, (s) => {
        for (const t of s.turns)
          if (t.status === 'pending') {
            t.status = 'error';
            t.error = '上次请求已中断，提交内容仍保留。请重试本轮。';
          }
      });
    }
    res.json(snapshot());
  });

  router.post('/start', async (req, res) => {
    const sessionId = id(req.body.requestId);
    const course = getState().courses.find((c) => c.id === req.body.courseId);
    const lesson = course?.lessons.find((l) => l.id === req.body.lessonId);
    if (!course || !lesson) throw new Error('没有找到对应的课程或小节。');
    const sameRequest = sessions().find((s) => s.id === sessionId);
    if (sameRequest && (sameRequest.courseId !== course.id || sameRequest.lessonId !== lesson.id))
      throw new Error('请求标识已用于其他小节。');
    const active = sessions().find((s) => s.courseId === course.id && s.lessonId === lesson.id && !s.endedAt);
    if (sameRequest || active) {
      res.json(snapshot());
      return;
    }
    const background = input(req.body.background, '学习背景', 2000, true);
    const now = new Date().toISOString();
    updateState((s) =>
      (s.guidedSessions ??= []).push({
        id: sessionId,
        courseId: course.id,
        lessonId: lesson.id,
        background,
        createdAt: now,
        updatedAt: now,
        revision: 0,
        turns: [
          { id: sessionId, action: 'start', content: '', createdAt: now, assistance: [], status: 'pending' },
        ],
      }),
    );
    await generate(sessionId, sessionId, res);
  });

  router.post('/:id/turn', async (req, res) => {
    const session = sessionById(req.params.id);
    const turnId = id(req.body.requestId);
    const action = req.body.action as GuidedAction;
    if (!guidedActions.includes(action) || action === 'start') throw new Error('带学操作无效。');
    const content = input(
      req.body.content,
      '提交内容',
      20000,
      !['answer', 'submit', 'challenge'].includes(action),
    );
    const existing = session.turns.find((t) => t.id === turnId);
    if (existing) {
      if (existing.action !== action || existing.content !== content)
        throw new Error('请求标识已用于另一条提交，请刷新后重试。');
      res.json(snapshot());
      return;
    }
    if (session.endedAt) throw new Error('这次带学已结束，可以开始新一轮。');
    if (action !== 'material' && req.body.revision !== session.revision)
      throw new Error('带学记录已有变化，请刷新记录后重试。');
    const pending = session.turns.find((t) => t.status === 'pending');
    if (action !== 'material' && (pending || running.has(session.id)))
      throw new Error('导师正在回应，请等待或停止当前请求。');
    if (action !== 'material' && session.turns.some((t) => t.status === 'error'))
      throw new Error('上一轮尚未完成，请重试，或结束本轮后重新开始。');
    const question = currentQuestion(session);
    const questionId =
      action === 'material' && pending && ['start', 'transfer', 'practice'].includes(pending.action)
        ? pending.id
        : question?.id;
    // Reading is evidence for this question, not a new conversation turn on every click.
    if (
      action === 'material' &&
      (!questionId || session.turns.some((t) => t.action === 'material' && t.questionId === questionId))
    ) {
      res.json(snapshot());
      return;
    }
    if (session.turns.length >= 160) throw new Error('这次学习已经很长了，请结束并保存后再开始新一轮。');
    if (['answer', 'submit', 'hint', 'explain'].includes(action) && !question)
      throw new Error('请先开始一个问题。');
    if (action === 'submit' && question?.response?.kind !== 'practice') throw new Error('请先领取实作任务。');
    if (action === 'answer' && question?.response?.kind === 'practice') throw new Error('请使用实作提交。');
    const turn: GuidedTurn = {
      id: turnId,
      action,
      content,
      createdAt: new Date().toISOString(),
      questionId,
      assistance: questionAssistance(session),
      status: action === 'material' ? 'complete' : 'pending',
    };
    if (req.body.viewedMaterial === true && !turn.assistance.includes('material'))
      turn.assistance.push('material');
    changeSession(session.id, (s) => s.turns.push(turn));
    if (action === 'material') res.json(snapshot());
    else await generate(session.id, turnId, res);
  });

  router.post('/:id/retry', async (req, res) => {
    const session = sessionById(req.params.id);
    const turn = session.turns.find((t) => t.id === req.body.turnId);
    if (!turn || session.endedAt) throw new Error('找不到可重试的请求。');
    if (turn.status === 'complete' || running.has(session.id)) {
      res.json(snapshot());
      return;
    }
    changeSession(session.id, (s) => {
      const saved = s.turns.find((t) => t.id === turn.id)!;
      saved.status = 'pending';
      delete saved.error;
    });
    await generate(session.id, turn.id, res);
  });

  router.post('/:id/finish', (req, res) => {
    const session = sessionById(req.params.id);
    if (running.has(session.id) || session.turns.some((t) => t.status === 'pending'))
      throw new Error('请先停止或等待当前请求。');
    if (!session.endedAt)
      changeSession(session.id, (s) => {
        s.endedAt = new Date().toISOString();
      });
    res.json(snapshot());
  });
  router.post('/:id/cancel', (req, res) => {
    sessionById(req.params.id);
    running.get(String(req.params.id))?.abort();
    res.json(snapshot());
  });
  return router;
}
