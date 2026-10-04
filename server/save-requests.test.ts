import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Bootstrap } from '../shared/types';

test('lost acknowledgements and retries save one record; receipts survive restart and reject changed input', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jianzhi-save-test-'));
  process.env.STUDY_TEST = '1';
  process.env.STUDY_DATA_DIR = directory;
  process.env.STUDY_ROOT = directory;
  process.env.STUDY_CODEX_BIN = '/nonexistent/codex';
  const { app } = await import('./index');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const originalFetch = globalThis.fetch;
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
    server.closeAllConnections();
    server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  let loseResponse = false;
  let offline = false;
  globalThis.fetch = async (input, init) => {
    if (offline) throw new TypeError('offline');
    const result = await originalFetch(base + input, init);
    if (loseResponse && init?.method === 'POST' && result.ok) {
      loseResponse = false;
      await result.text();
      throw new TypeError('response lost after commit');
    }
    return result;
  };
  const { saveRequest } = await import('../src/save-request');
  const scope = directory;
  loseResponse = true;
  const created = await saveRequest<Bootstrap & { courseId: string }>(
    '/courses',
    {
      title: '去重验收',
      content: '# 保存\n网络失败不能重复创建主题，也不能重复保存回答。',
    },
    scope,
  );
  assert.equal(created.state.courses.length, 1);
  const courseId = created.courseId;
  const lessonId = created.state.courses[0].lessons[0].id;
  loseResponse = true;
  const noted = await saveRequest('/notes', { courseId, lessonId, kind: 'note', content: '保留一次' }, scope);
  assert.equal(noted.state.notes.length, 1);
  const answer = {
    courseId,
    lessonId,
    rating: 'good',
    revealed: false,
    answer: '解释写入和回包的区别。',
    seconds: 18,
  };
  offline = true;
  await assert.rejects(saveRequest('/reviews', answer, scope));
  offline = false;
  loseResponse = true;
  const reviewed = await saveRequest('/reviews', { ...answer, seconds: 42 }, scope);
  assert.equal(reviewed.state.reviews.length, 1);
  assert.equal(reviewed.state.reviews[0].seconds, 18);
  assert.equal(reviewed.state.progress[`${courseId}:${lessonId}`].attempts, 1);
  assert.ok((reviewed.state.revision ?? 0) > (created.state.revision ?? 0));
  const raw = JSON.parse(fs.readFileSync(path.join(directory, 'study.json'), 'utf8'));
  assert.equal(raw.version, 1);
  assert.ok(raw.reviews[0].creationRequest.id);
  // Recreate the middleware to represent a process restart: no in-memory receipt cache is required.
  const { saveRequests } = await import('./save-requests');
  const express = (await import('express')).default;
  const restarted = express();
  restarted.use(express.json());
  restarted.use(saveRequests(() => reviewed));
  restarted.post('/api/reviews', (_req, res) => res.status(500).json({ error: 'Must not write twice' }));
  const restartServer = restarted.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => restartServer.once('listening', resolve));
  t.after(() => {
    restartServer.closeAllConnections();
    restartServer.close();
  });
  const retry = (body: unknown) =>
    originalFetch(`http://127.0.0.1:${(restartServer.address() as AddressInfo).port}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': raw.reviews[0].creationRequest.id },
      body: JSON.stringify(body),
    });
  assert.equal((await retry(answer)).status, 200);
  assert.equal((await retry({ ...answer, answer: '不同的回答' })).status, 409);
  const id = randomUUID();
  const body = { courseId, kind: 'note', content: '并发提交' };
  const responses = await Promise.all(
    [1, 2].map(() =>
      originalFetch(base + '/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': id },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    ),
  );
  assert.equal(responses[1].state.notes.length, 2);
  assert.equal(responses[0].state.notes.length, 2);
});
