import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSummary } from './summaries';

test('summary cards accept bounded structured content and reject malformed responses', () => {
  const content = {
    title: '输入与状态',
    takeaway: '输入驱动状态变化。',
    points: [
      { title: '输入', body: '来自用户。' },
      { title: '状态', body: '记录当前上下文。' },
      { title: '边界', body: '校验输入。' },
    ],
    nextQuestion: '什么情况下需要持久化？',
  };
  assert.deepEqual(parseSummary('```json\n' + JSON.stringify(content) + '\n```'), content);
  assert.throws(() => parseSummary(JSON.stringify({ ...content, points: [] })), /尚未保存/);
  assert.throws(() => parseSummary(JSON.stringify({ ...content, takeaway: 'a'.repeat(181) })), /尚未保存/);
  assert.throws(() => parseSummary('not JSON'), /尚未保存/);
});
