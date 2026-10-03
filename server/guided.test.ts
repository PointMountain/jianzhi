import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import type { StudyState } from '../shared/types';
import { guidedEvidence, currentQuestion, guidedTranscript, questionAssistance } from '../shared/guided';

test('guided learning retains evidence through hints, transfer, practice, retries and restart without grading mastery', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jianzhi-guided-test-'));
  const storage = path.join(directory, 'study');
  const mode = path.join(directory, 'mode');
  const trace = path.join(directory, 'trace');
  const binary = path.join(directory, 'codex');
  const fixture = fileURLToPath(new URL('./fixtures/guided-codex.cjs', import.meta.url));
  fs.writeFileSync(binary, `#!${process.execPath}\nrequire(${JSON.stringify(fixture)});`, { mode: 0o700 });
  process.env.STUDY_TEST = '1';
  process.env.STUDY_DATA_DIR = storage;
  process.env.STUDY_CODEX_BIN = binary;
  process.env.GUIDED_FIXTURE_MODE = mode;
  process.env.GUIDED_FIXTURE_TRACE = trace;
  const { app } = await import('./index');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  async function post(route: string, body: unknown) {
    const response = await fetch(url + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  const exported = async (): Promise<StudyState> => (await fetch(url + '/export')).json();
  let serial = 0;
  try {
    const created = await post('/courses', {
      title: '工具调用',
      content: '# 执行和回传\n程序调用真实工具，并将工具结果追加到下一轮模型上下文。',
    });
    const course = created.data.state.courses[0];
    const lesson = course.lessons[0];
    await post('/notes', {
      courseId: course.id,
      lessonId: lesson.id,
      kind: 'note',
      content: '原有笔记不能丢失。',
    });
    const original = await exported();
    assert.equal(original.guidedSessions, undefined);
    const start = {
      requestId: 'session-start-001',
      courseId: course.id,
      lessonId: lesson.id,
      background: '熟悉 TypeScript 事件处理',
    };
    const started = await post('/guided/start', start);
    assert.equal(started.status, 200);
    let session = started.data.state.guidedSessions[0];
    assert.equal(session.turns[0].response.kind, 'question');
    assert.equal(session.turns[0].response.assessment, null);
    assert.equal((await post('/guided/start', start)).data.state.guidedSessions.length, 1);
    assert.equal(fs.readFileSync(trace, 'utf8').trim().split('\n').length, 1);
    async function turn(action: string, content = '') {
      const body = { requestId: `turn-test-${++serial}`, revision: session.revision, action, content };
      const response = await post(`/guided/${session.id}/turn`, body);
      assert.equal(response.status, 200, JSON.stringify(response.data));
      session = response.data.state.guidedSessions[0];
      return body;
    }
    await turn('answer', '不知道');
    assert.equal(session.turns.at(-1).response.kind, 'hint');
    await turn('hint');
    await turn('hint');
    assert.equal(session.turns.at(-1).response.kind, 'explanation');
    const answerRequest = await turn('answer', '程序检查工具、执行请求，再把结果回传模型。');
    const answered = session.turns.at(-1);
    assert.ok(answered.assistance.includes('hint'));
    assert.ok(answered.assistance.includes('explanation'));
    assert.equal(answered.response.kind, 'transfer');
    const length = session.turns.length;
    assert.equal(
      (await post(`/guided/${session.id}/turn`, answerRequest)).data.state.guidedSessions[0].turns.length,
      length,
    );
    assert.equal(
      (await post(`/guided/${session.id}/turn`, { ...answerRequest, content: '不同内容' })).status,
      400,
    );
    assert.equal(
      (
        await post(`/guided/${session.id}/turn`, {
          requestId: 'stale-request-001',
          revision: 0,
          action: 'answer',
          content: '旧页面的回答',
        })
      ).status,
      400,
    );
    await turn('answer', '检查工具结果是否追加到上下文，并与对应调用关联。');
    assert.deepEqual(session.turns.at(-1).assistance, []);
    assert.equal(session.turns.at(-1).response.kind, 'feedback');
    await turn('material');
    const materialQuestion = currentQuestion(session)!.id;
    const viewedRevision = session.revision;
    const viewedLength = session.turns.length;
    await Promise.all(
      ['repeat-material-001', 'repeat-material-002'].map((requestId) =>
        post(`/guided/${session.id}/turn`, { requestId, action: 'material' }),
      ),
    );
    session = (await exported()).guidedSessions![0];
    assert.equal(session.revision, viewedRevision, '反复查看同一道题的原文不应反复写入记录');
    assert.equal(session.turns.length, viewedLength);
    assert.equal(
      session.turns.filter(
        (t: { action: string; questionId?: string }) =>
          t.action === 'material' && t.questionId === materialQuestion,
      ).length,
      1,
    );
    assert.doesNotMatch(guidedTranscript(session), /^### 查看原文/m);
    assert.match(guidedTranscript(session), /本题参考记录：看过原文/);
    const legacy = structuredClone(session);
    legacy.turns.push({ ...legacy.turns.at(-1)!, id: 'legacy-duplicate-material' });
    assert.equal(guidedTranscript(legacy), guidedTranscript(session), '旧重复记录不应重复显示');
    await turn('answer', '查看材料后，我认为要检查结果的回传。');
    assert.ok(session.turns.at(-1).assistance.includes('material'));
    const prompted = JSON.parse(fs.readFileSync(trace, 'utf8').trim().split('\n').at(-1)!);
    assert.ok(prompted.assistance.includes('material'));
    assert.ok(prompted.history.every((t: { action: string }) => t.action !== 'material'));
    const beforeChallenge = guidedEvidence(session).answers.length;
    await turn('challenge', '这里的关联关系能再解释一下吗？');
    assert.equal(guidedEvidence(session).answers.length, beforeChallenge);
    assert.equal(session.turns.at(-1).response.assessment, null);
    const originalAnswerId = guidedEvidence(session).answers.at(-1)!.id;
    await turn('challenge', '请纠正：我的原回答已经写明结果回传。');
    assert.equal(session.turns.at(-1).response.assessment.answerId, originalAnswerId);
    assert.equal(guidedEvidence(session).answers.length, beforeChallenge);
    assert.ok(guidedEvidence(session).supported.some((p) => /复核原回答/.test(p)));
    await turn('practice');
    assert.equal(currentQuestion(session)?.response?.kind, 'practice');
    assert.match(session.turns.at(-1).response.exercise.scaffold, /TODO/);
    assert.equal(questionAssistance(session).includes('material'), false);
    await turn('material');
    await turn('material');
    assert.equal(questionAssistance(session).includes('material'), true);
    assert.equal(session.turns.filter((t: { action: string }) => t.action === 'material').length, 2);
    await turn('submit', '核心实现和结果回传已经补齐。运行结果：工具执行成功，并将真实结果加入上下文。');
    assert.equal(session.turns.at(-1).response.kind, 'feedback');

    await turn('transfer');
    await turn('answer', '不知道这道变式题该怎么判断');
    await turn('transfer');
    await turn('answer', '检查执行与结果回传，再确认下一轮上下文。');
    assert.ok(
      guidedEvidence(session).gaps.includes('还需要区分谁执行工具。'),
      '换题后答对不能抹掉上一题未解决的缺口',
    );

    fs.writeFileSync(mode, 'bad-source');
    const badRequest = await turn('transfer');
    assert.equal(session.turns.at(-1).status, 'error');
    assert.match(session.turns.at(-1).error, /原文/);
    const attempts = session.turns.length;
    fs.writeFileSync(mode, '');
    session = (await post(`/guided/${session.id}/retry`, { turnId: badRequest.requestId })).data.state
      .guidedSessions[0];
    assert.equal(session.turns.length, attempts);
    assert.equal(session.turns.at(-1).status, 'complete');

    fs.writeFileSync(mode, 'fake-assessment');
    const fake = await turn('hint');
    assert.equal(session.turns.at(-1).status, 'error');
    fs.writeFileSync(mode, '');
    session = (await post(`/guided/${session.id}/retry`, { turnId: fake.requestId })).data.state
      .guidedSessions[0];

    fs.writeFileSync(mode, 'slow');
    const pendingId = 'pending-answer-001';
    const slow = post(`/guided/${session.id}/turn`, {
      requestId: pendingId,
      revision: session.revision,
      action: 'answer',
      content: '这条真实提交必须在响应前保存。',
    });
    const deadline = Date.now() + 5000;
    while (
      Date.now() < deadline &&
      !(await exported()).guidedSessions?.[0].turns.some((t) => t.id === pendingId)
    )
      await new Promise((resolve) => setTimeout(resolve, 30));
    const pending = (await exported()).guidedSessions![0].turns.at(-1)!;
    assert.equal(pending.id, pendingId);
    assert.equal(pending.status, 'pending');
    assert.equal(pending.content, '这条真实提交必须在响应前保存。');
    assert.equal((await post(`/guided/${session.id}/finish`, {})).status, 400);
    await post(`/guided/${session.id}/cancel`, {});
    session = (await slow).data.state.guidedSessions[0];
    assert.equal(session.turns.at(-1).status, 'error');
    fs.writeFileSync(mode, '');
    session = (await post(`/guided/${session.id}/retry`, { turnId: pendingId })).data.state.guidedSessions[0];
    assert.equal(session.turns.filter((t: { id: string }) => t.id === pendingId).length, 1);
    const finished = await post(`/guided/${session.id}/finish`, {});
    assert.ok(finished.data.state.guidedSessions[0].endedAt);
    assert.equal(
      (await post(`/guided/${session.id}/turn`, { requestId: 'after-ended-001', action: 'hint' })).status,
      400,
    );
    const saved = await exported();
    assert.equal(saved.version, 1);
    assert.deepEqual(saved.notes, original.notes);
    for (const field of ['progress', 'reviews', 'chats', 'completions'] as const)
      assert.deepEqual(saved[field], original[field]);
    const mirror = fs.readFileSync(path.join(storage, 'exports/learning-notes.md'), 'utf8');
    assert.match(mirror, /这条真实提交必须在响应前保存/);
    assert.match(mirror, /用过提示/);
    assert.match(mirror, /TODO/);
    const restarted = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '-e',
          "const s = await import('./server/store.ts'); console.log(JSON.stringify(s.getState()));",
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      ),
    );
    assert.deepEqual(restarted.guidedSessions, saved.guidedSessions);
    const restartDir = path.join(directory, 'interrupted-restart');
    fs.mkdirSync(restartDir);
    const interrupted = structuredClone(saved);
    delete interrupted.guidedSessions![0].endedAt;
    const interruptedTurn = interrupted.guidedSessions![0].turns.at(-1)!;
    interruptedTurn.status = 'pending';
    delete interruptedTurn.response;
    fs.writeFileSync(path.join(restartDir, 'study.json'), JSON.stringify(interrupted));
    const recovered = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '-e',
          `
      const { app } = await import('./server/index.ts');
      const server = app.listen(0, '127.0.0.1');
      await new Promise(resolve => server.once('listening', resolve));
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/guided/' + ${JSON.stringify(session.id)});
      console.log(JSON.stringify((await response.json()).state.guidedSessions[0]));
      await new Promise(resolve => server.close(resolve));
    `,
        ],
        { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, STUDY_DATA_DIR: restartDir } },
      ),
    );
    assert.equal(recovered.turns.at(-1).status, 'error');
    assert.equal(recovered.turns.at(-1).content, interruptedTurn.content);
    assert.match(recovered.turns.at(-1).error, /中断/);
    assert.equal(
      (await post('/guided/start', { ...start, requestId: 'session-second-002' })).data.state.guidedSessions
        .length,
      2,
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
