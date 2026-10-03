import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CircleNotch,
  DownloadSimple,
  GearSix,
  Lightbulb,
  PaperPlaneTilt,
} from '@phosphor-icons/react';
import type { Bootstrap, Course, Lesson } from '../shared/types';
import {
  actionLabels,
  currentQuestion,
  guidedEvidence,
  guidedTranscript,
  guidanceLabels,
  stepLabels,
  type GuidedAction,
  type GuidedSession,
  type GuidedTurn,
} from '../shared/guided';
import { request, formatDay } from './lib';
import { Disclosure } from './Controls';
import { Markdown } from './Markdown';

export function GuidedTurnView({ turn, onMaterial }: { turn: GuidedTurn; onMaterial?: () => void }) {
  if (turn.action === 'material') return null;
  const step = turn.response;
  return (
    <article className="guided-turn">
      {turn.action !== 'start' && (
        <div className="guided-submission">
          <span className="badge">{actionLabels[turn.action]}</span>
          {turn.content && <Markdown>{turn.content}</Markdown>}
          {(turn.action === 'answer' || turn.action === 'submit') && (
            <p className="small muted">
              {turn.assistance.length
                ? turn.assistance.map((a) => guidanceLabels[a]).join(' · ')
                : '本题未记录提示或参考'}
            </p>
          )}
        </div>
      )}
      {step && (
        <div className="guided-response">
          <span className="eyebrow">{stepLabels[step.kind]}</span>
          <Markdown>{step.message}</Markdown>
          {step.assessment && (
            <div className="guided-assessment">
              <span className="small muted">
                {turn.action === 'challenge'
                  ? '导师复核此前回答 · 原作答仍保留'
                  : '导师核对建议 · 可追问或纠正'}
              </span>
              {step.assessment.supported.length > 0 && (
                <>
                  <h4>有依据的部分</h4>
                  <ul>
                    {step.assessment.supported.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </>
              )}
              {step.assessment.gaps.length > 0 && (
                <>
                  <h4>还需补足或核对</h4>
                  <ul>
                    {step.assessment.gaps.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          {step.question && (
            <div className="guided-question">
              <Markdown>{step.question}</Markdown>
            </div>
          )}
          {step.exercise && (
            <section className="guided-exercise">
              <h3>{step.exercise.title}</h3>
              <Markdown>{step.exercise.goal}</Markdown>
              <h4>从这份骨架开始</h4>
              <Markdown>{step.exercise.scaffold}</Markdown>
              <h4>在编辑器中验证</h4>
              <ul>
                {step.exercise.checks.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              <button className="outline-button" onClick={() => downloadExercise(step.exercise!)}>
                <DownloadSimple size={17} />
                下载练习说明
              </button>
            </section>
          )}
          {step.sourceQuote && (
            <Disclosure
              title="查看这次讲解的原文依据"
              onOpenChange={(open) => {
                if (open) onMaterial?.();
              }}
            >
              <blockquote>{step.sourceQuote}</blockquote>
            </Disclosure>
          )}
        </div>
      )}
    </article>
  );
}

function downloadExercise(exercise: NonNullable<NonNullable<GuidedTurn['response']>['exercise']>) {
  const content = [
    `# ${exercise.title}`,
    '',
    exercise.goal,
    '',
    '## 骨架',
    '',
    exercise.scaffold,
    '',
    '## 验收要求',
    '',
    ...exercise.checks.map((c) => `- ${c}`),
  ].join('\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'jianzhi-exercise.md';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function GuidedRecord({ session }: { session: GuidedSession }) {
  const evidence = guidedEvidence(session);
  return (
    <section className="guided-record">
      <h3>{session.endedAt ? '这一轮，留下了什么' : '已经留下的学习记录'}</h3>
      <p>
        {evidence.answers.length} 次实际提交 · {evidence.assisted} 次有本题提示或参考记录
      </p>
      {evidence.supported.length > 0 && (
        <>
          <h4>本轮回答中有依据的部分</h4>
          <ul>
            {evidence.supported.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </>
      )}
      {evidence.gaps.length > 0 && (
        <>
          <h4>还需补足或核对</h4>
          <ul>
            {evidence.gaps.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </>
      )}
      {evidence.unanswered.length > 0 && (
        <p>还有 {evidence.unanswered.length} 道问题未作答，可回到记录继续思考。</p>
      )}
      <p>
        <strong>下一步建议：</strong>
        {evidence.nextStep}
      </p>
      <p className="small muted">建议来自导师反馈，不代表长期掌握。实作运行结果由你提供。</p>
    </section>
  );
}

export function GuidedLearning({
  data,
  course,
  lesson,
  active,
  update,
  onRead,
  onMaterial,
  openSettings,
  navigate,
}: {
  data: Bootstrap;
  course: Course;
  lesson: Lesson;
  active: boolean;
  update: (data: Bootstrap) => void;
  onRead: () => void;
  onMaterial: () => void;
  openSettings: () => void;
  navigate: (path: string) => void;
}) {
  const sessions = (data.state.guidedSessions ?? []).filter(
    (s) => s.courseId === course.id && s.lessonId === lesson.id,
  );
  const session = sessions.at(-1);
  const current = session && currentQuestion(session);
  const last = session?.turns.filter((t) => t.action !== 'material').at(-1);
  const pending = session?.turns.some((t) => t.status === 'pending');
  const failed = session?.turns.find((t) => t.status === 'error');
  const draftKey = `guided-draft:${course.id}:${lesson.id}`;
  const [draft, setDraft] = useState(() => localStorage.getItem(draftKey) ?? '');
  const [background, setBackground] = useState(
    () =>
      session?.background ??
      data.state.guidedSessions?.filter((s) => s.courseId === course.id).at(-1)?.background ??
      '',
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const requestSession = useRef<string | null>(null);
  const mounted = useRef(true),
    locked = useRef(false),
    latest = useRef(data);
  const end = useRef<HTMLDivElement>(null);
  latest.current = data;
  const blocked = busy || !!pending;
  const next = course.lessons[course.lessons.indexOf(lesson) + 1];
  const checkpoint = !next || next.chapterIndex !== lesson.chapterIndex;

  function accept(value: Bootstrap) {
    const old = latest.current.state.guidedSessions?.find((s) => s.id === session?.id);
    const incoming = value.state.guidedSessions?.find((s) => s.id === session?.id);
    if (old && incoming && incoming.revision < old.revision) return;
    if (mounted.current) update(value);
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      if (locked.current && requestSession.current) {
        void request(`/guided/${requestSession.current}/cancel`, {}).catch(() => {});
      }
    };
  }, []);
  useEffect(() => {
    localStorage.setItem(draftKey, draft);
  }, [draft, draftKey]);
  useEffect(() => {
    if (!session || !active) return;
    let stopped = false;
    void request(`/guided/${session.id}`)
      .then((value) => {
        if (!stopped) accept(value);
      })
      .catch((e: Error) => {
        if (!stopped) setError(e.message);
      });
    return () => {
      stopped = true;
    };
  }, [session?.id, active]);
  useEffect(() => {
    if (!session || !pending) return;
    let stopped = false;
    const timer = setInterval(() => {
      void request(`/guided/${session.id}`)
        .then((value) => {
          if (!stopped) accept(value);
        })
        .catch(() => {});
    }, 1500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [session?.id, pending]);
  useEffect(() => {
    if (active && last?.status === 'complete')
      end.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [last?.id, last?.status, active]);

  async function perform(url: string, body: unknown, consumesDraft = false) {
    if (locked.current) return;
    locked.current = true;
    requestSession.current ??= session?.id ?? null;
    setBusy(true);
    setError('');
    controller.current = new AbortController();
    try {
      const value = await request(url, body, 'POST', controller.current.signal);
      accept(value);
      if (consumesDraft && mounted.current) setDraft('');
    } catch (e) {
      if (mounted.current) {
        setError(
          (e as Error).name === 'AbortError' ? '已停止，已提交的内容仍保留在记录中。' : (e as Error).message,
        );
        try {
          accept(await request(session ? `/guided/${session.id}` : '/bootstrap'));
        } catch {
          /* keep the draft and explicit error */
        }
      }
    } finally {
      locked.current = false;
      requestSession.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  function start() {
    if (locked.current) return;
    requestSession.current = crypto.randomUUID();
    void perform('/guided/start', {
      requestId: requestSession.current,
      courseId: course.id,
      lessonId: lesson.id,
      background,
    });
  }
  function send(action: GuidedAction, content = '') {
    if (!session) return;
    void perform(
      `/guided/${session.id}/turn`,
      {
        requestId: crypto.randomUUID(),
        revision: session.revision,
        action,
        content,
        viewedMaterial: !!localStorage.getItem(`guided-material:${session.id}:${current?.id}`),
      },
      ['answer', 'submit', 'challenge'].includes(action),
    );
  }
  async function stop() {
    const id = requestSession.current ?? session?.id;
    if (id) {
      try {
        accept(await request(`/guided/${id}/cancel`, {}));
      } catch (e) {
        setError((e as Error).message);
      }
    }
    controller.current?.abort();
  }

  return (
    <section className="guided-panel" aria-label="跟导师学">
      <div className="guided-heading">
        <div>
          <span className="eyebrow">从一个问题，走进理解</span>
          <h1>跟导师学</h1>
        </div>
        <button className="quiet" onClick={openSettings}>
          <GearSix size={18} />
          学习设置
        </button>
      </div>
      <p className="muted">先尝试，再补上缺口。最后换一个情境，看看能否自己判断。</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!session && (
        <div className="guided-intro">
          <h2>{lesson.title}</h2>
          <p>导师会围绕本节材料，一次问一个问题。卡住可以要提示、直接看讲解，也可以随时回到原文。</p>
          <label className="answer-label">
            你熟悉什么？希望借助什么例子理解？（选填）
            <textarea
              value={background}
              maxLength={2000}
              rows={3}
              disabled={blocked}
              onChange={(e) => setBackground(e.target.value)}
              placeholder="例如：我熟悉的工作、技能，或这次想解决的问题。"
            />
          </label>
          <button className="primary" disabled={blocked} onClick={start}>
            <Lightbulb size={18} />
            {busy ? '正在准备第一个问题…' : '开始这一节的带学'}
          </button>
          {busy && (
            <button className="quiet" onClick={() => void stop()}>
              停止准备
            </button>
          )}
        </div>
      )}
      {session && (
        <>
          <div className="guided-meta">
            <span className="badge">
              {session.endedAt
                ? '本轮已结束'
                : current?.response?.kind === 'practice'
                  ? '实作练习'
                  : current?.response?.kind === 'transfer'
                    ? '变式验证'
                    : '逐层理解'}
            </span>
            <span className="small muted">{formatDay(session.createdAt)} · 提交自动保存</span>
          </div>
          <div className="guided-conversation">
            {session.turns.map((turn) => (
              <GuidedTurnView
                key={turn.id}
                turn={turn}
                onMaterial={session.endedAt ? undefined : onMaterial}
              />
            ))}
          </div>
          <div ref={end} />
          {blocked && (
            <div className="thinking" role="status">
              <CircleNotch className="spin" size={18} />
              导师正在回应…
              <button className="quiet" onClick={() => void stop()}>
                停止本轮请求
              </button>
            </div>
          )}
          {failed && !blocked && !session.endedAt && (
            <div className="guided-error" role="alert">
              <p>{failed.error}</p>
              <p className="small">这次提交已经保存，重试不会重复记一份回答。</p>
              <button
                className="outline-button"
                onClick={() => void perform(`/guided/${session.id}/retry`, { turnId: failed.id })}
              >
                重试本轮
              </button>
            </div>
          )}
          {!session.endedAt && (
            <>
              {current && (
                <div className="guided-composer">
                  <label className="answer-label">
                    {current.response?.kind === 'practice'
                      ? '提交核心实现、运行结果和你的设计理由'
                      : '说说你的判断和理由'}
                    <textarea
                      rows={5}
                      maxLength={20000}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      disabled={blocked || !!failed}
                      placeholder={
                        current.response?.kind === 'practice'
                          ? '粘贴代码、验收结果，也写下还没有解决的问题。平台会核对提交内容，不会执行代码。'
                          : '不确定也可以写出来。先说你怎么想，再一起检查。'
                      }
                    />
                  </label>
                  <div className="button-row">
                    <button
                      className="primary"
                      disabled={blocked || !!failed || !draft.trim()}
                      onClick={() => send(current.response?.kind === 'practice' ? 'submit' : 'answer', draft)}
                    >
                      <PaperPlaneTilt size={17} />
                      {current.response?.kind === 'practice' ? '提交实作并核对' : '提交回答'}
                    </button>
                    <button
                      className="outline-button"
                      disabled={blocked || !!failed || !draft.trim()}
                      onClick={() => send('challenge', draft)}
                    >
                      这是追问或纠正
                    </button>
                  </div>
                  <div className="guided-actions">
                    <button className="quiet" disabled={blocked || !!failed} onClick={() => send('hint')}>
                      给一点提示
                    </button>
                    <button className="quiet" disabled={blocked || !!failed} onClick={() => send('explain')}>
                      直接讲解
                    </button>
                    <button className="quiet" onClick={onRead}>
                      <BookOpen size={16} />
                      查看原文
                    </button>
                  </div>
                </div>
              )}
              <div className="guided-next">
                <p className="small muted">
                  {checkpoint
                    ? '本章到了一个节点，可以用小实作组合应用。'
                    : '需要时可以换题或尝试实作，学习顺序由你决定。'}
                </p>
                <div className="button-row">
                  <button
                    className="outline-button"
                    disabled={blocked || !!failed}
                    onClick={() => send('transfer')}
                  >
                    换个情境验证
                  </button>
                  <button
                    className="outline-button"
                    disabled={blocked || !!failed}
                    onClick={() => send('practice')}
                  >
                    安排一个小实作
                  </button>
                  <button
                    className="quiet"
                    disabled={blocked}
                    onClick={() => void perform(`/guided/${session.id}/finish`, {})}
                  >
                    结束并整理本轮
                  </button>
                </div>
              </div>
            </>
          )}
          {session.endedAt && (
            <>
              <GuidedRecord session={session} />
              <div className="button-row">
                <button className="primary" disabled={blocked} onClick={start}>
                  开始新一轮带学
                </button>
                <button className="outline-button" onClick={() => navigate('/activity?tab=guided')}>
                  查看全部带学记录
                </button>
              </div>
            </>
          )}
          {sessions.length > 1 && (
            <Disclosure title={`之前的 ${sessions.length - 1} 次带学记录`}>
              {sessions
                .slice(0, -1)
                .reverse()
                .map((s) => (
                  <Disclosure
                    key={s.id}
                    title={`${formatDay(s.createdAt)} · ${guidedEvidence(s).answers.length} 次提交`}
                  >
                    <Markdown>{guidedTranscript(s)}</Markdown>
                  </Disclosure>
                ))}
            </Disclosure>
          )}
        </>
      )}
      <div className="guided-navigation">
        <button className="quiet" onClick={onRead}>
          回到原文阅读
        </button>
        {next && (
          <button className="quiet" onClick={() => navigate(`/learn/${course.id}/${next.id}?guided`)}>
            继续下一节 <ArrowRight size={17} />
          </button>
        )}
      </div>
    </section>
  );
}
