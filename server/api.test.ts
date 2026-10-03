import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import http from 'node:http';

test('local API saves real records, validates ownership, exports and survives restart', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shizhi-api-test-'));
  process.env.STUDY_TEST = '1';
  process.env.STUDY_DATA_DIR = dir;
  process.env.STUDY_ROOT = dir;
  process.env.STUDY_CODEX_BIN = '/nonexistent/codex'; // Integration tests must never spend account quota.
  const { app } = await import('./index');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  async function send(route: string, body: unknown, method = 'POST') {
    const response = await fetch(url + route, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  try {
    assert.equal((await fetch(url + '/bootstrap')).status, 200);
    assert.equal(
      (await fetch(url + '/bootstrap', { headers: { Origin: 'https://evil.example' } })).status,
      403,
    );
    const badHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      http
        .get(url + '/bootstrap', { headers: { Host: 'evil.example' } }, (res) => {
          res.resume();
          resolve(res.statusCode);
        })
        .on('error', reject);
    });
    assert.equal(badHostStatus, 403);
    assert.equal((await fetch(url + '/notes', { method: 'POST', body: 'unsafe' })).status, 415);
    const created = await send('/courses', {
      title: 'API testing',
      content: '# State\nStore state in a file so that refresh does not lose your learning history.',
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.storagePath, dir);
    const courseId = created.data.courseId;
    const lessonId = created.data.state.courses[0].lessons[0].id;
    assert.equal(created.data.state.reviews.length, 0);
    assert.equal((await send('/completions', { courseId, lessonId: 'missing' })).status, 400);
    const completed = await send('/completions', { courseId, lessonId });
    assert.equal(completed.status, 200);
    const completion = completed.data.state.completions[`${courseId}:${lessonId}`];
    assert.equal(completion.source, 'reading');
    assert.deepEqual(completed.data.state.progress, {});
    assert.equal(completed.data.state.reviews.length, 0);
    assert.deepEqual(
      (await send('/completions', { courseId, lessonId })).data.state.completions,
      completed.data.state.completions,
    );
    const note = await send('/notes', {
      courseId,
      lessonId,
      kind: 'question',
      content: 'How does persistence survive a restart?',
    });
    assert.equal(note.status, 201);
    const noteId = note.data.state.notes[0].id;
    assert.equal(
      (await send('/notes', { courseId, lessonId: 'unknown', kind: 'note', content: 'wrong lesson' })).status,
      400,
    );
    const updated = await send(
      `/notes/${noteId}`,
      { content: 'The server writes the file atomically.', resolved: true },
      'PATCH',
    );
    assert.equal(updated.data.state.notes[0].resolved, true);
    const disposable = await send('/notes', {
      courseId,
      lessonId,
      kind: 'note',
      content: 'Delete only this note',
    });
    const deleteId = disposable.data.state.notes[0].id;
    assert.equal((await send(`/notes/${deleteId}`, {}, 'DELETE')).data.state.notes.length, 1);
    assert.equal((await send(`/notes/${deleteId}`, {}, 'DELETE')).status, 404);
    const review = await send('/reviews', {
      courseId,
      lessonId,
      answer: 'Atomic replacement preserves a complete record.',
      rating: 'good',
      revealed: true,
      seconds: 120,
      feedback: '具体反馈：保留完整记录的解释正确。',
    });
    assert.equal(review.status, 201);
    assert.equal(review.data.state.reviews[0].rating, 'hint');
    assert.equal(review.data.state.reviews[0].feedback, '具体反馈：保留完整记录的解释正确。');
    assert.deepEqual(review.data.state.completions[`${courseId}:${lessonId}`], completion);
    assert.deepEqual(
      Object.values(review.data.state.progress).map((p: any) => p.independentDates),
      [[]],
    );
    assert.equal((await send('/reviews', { courseId, lessonId, answer: '', rating: 'good' })).status, 400);
    assert.equal((await send('/preferences', { dailyMinutes: 999 })).status, 400);
    assert.equal((await send('/preferences', { dailyMinutes: 30 })).status, 200);
    assert.equal((await send('/model', { model: '--bad argument' })).status, 400);
    assert.equal((await send('/model', { model: '', effort: 'invented' })).status, 400);
    assert.equal((await send('/model', { model: '', fast: 'yes' })).status, 400);
    assert.equal((await send('/model', { model: 'gpt-5.5' })).data.state.preferences.codexModel, 'gpt-5.5');
    assert.equal((await send('/summaries', { courseId, lessonId })).status, 400);
    const tutor = await send('/tutor', { courseId, lessonId, message: 'Explain persistence' });
    assert.equal(tutor.status, 400);
    assert.equal(
      (await send('/recall-feedback', { courseId, lessonId, answer: 'My explanation' })).status,
      400,
    );
    const exported = await (await fetch(url + '/export')).json();
    assert.equal(exported.notes.length, 1);
    assert.deepEqual(exported.chats, {}); // Failed requests must not become fake conversation evidence.
    assert.equal(exported.summaries?.length || 0, 0);
    assert.equal(exported.reviews.length, 1);
    assert.match(await (await fetch(url + '/export?format=markdown')).text(), /Atomic replacement/);
    const restarted = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        'const {getState}=await import("./server/store.ts"); console.log(JSON.stringify(getState()));',
      ],
      { cwd: process.cwd(), env: process.env, encoding: 'utf8' },
    );
    assert.equal(restarted.status, 0, restarted.stderr);
    assert.deepEqual(JSON.parse(restarted.stdout), exported);
    assert.deepEqual(fs.readdirSync(dir).sort(), ['backups', 'exports', 'study.json', 'topics']);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'topics', courseId)).sort(), [
      'context',
      'exercises',
      'source',
    ]);
    const mirror = fs.readFileSync(path.join(dir, 'exports/learning-notes.md'), 'utf8');
    assert.match(mirror, /Atomic replacement preserves a complete record/);
    assert.match(mirror, /The server writes the file atomically/);
    assert.match(mirror, /已学完的小节/);
    assert.match(mirror, /具体反馈：保留完整记录的解释正确/);
    assert.doesNotMatch(mirror, /Delete only this note/);
    assert.doesNotMatch(mirror, /\.data\/study.json/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
