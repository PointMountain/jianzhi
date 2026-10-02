import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, localDay, schedule, splitMarkdown } from './domain';

test('review dates use Shanghai midnight, including month and year boundaries', () => {
  assert.equal(localDay(new Date('2026-10-01T16:00:00Z')), '2026-10-02');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});
test('same-day repetitions and early practice do not accelerate the schedule', () => {
  const first = schedule(undefined, 'good', 'c', 'l', new Date('2026-10-02T01:00:00Z'));
  assert.equal(first.due, '2026-10-03');
  const repeat = schedule(first, 'good', 'c', 'l', new Date('2026-10-02T05:00:00Z'));
  assert.equal(repeat.stage, 0);
  assert.equal(repeat.independentDates.length, 1);
  const due = schedule(repeat, 'good', 'c', 'l', new Date('2026-10-03T01:00:00Z'));
  assert.equal(due.due, '2026-10-06');
  const early = schedule(due, 'good', 'c', 'l', new Date('2026-10-04T01:00:00Z'));
  assert.equal(early.stage, 1);
  assert.equal(early.due, '2026-10-06');
});
test('forgetting resets the interval and cross-day recall evidence', () => {
  let p = schedule(undefined, 'good', 'c', 'l', new Date('2026-10-02T01:00:00Z'));
  p = schedule(p, 'good', 'c', 'l', new Date('2026-10-03T01:00:00Z'));
  p = schedule(p, 'hint', 'c', 'l', new Date('2026-10-06T01:00:00Z'));
  assert.equal(p.due, '2026-10-07');
  assert.equal(p.stage, 0);
  assert.deepEqual(p.independentDates, []);
  assert.equal(p.attempts, 3);
});
test('headings inside code fences never create phantom lessons', () => {
  const content =
    '# First\r\nA sufficiently long introductory paragraph.\r\n```md\r\n## Inside code\r\n```\r\n## Second\r\nAnother sufficiently long paragraph for a lesson.';
  const parts = splitMarkdown(content, 'Fallback');
  assert.deepEqual(
    parts.map((s) => s.title),
    ['First', 'Second'],
  );
  assert.match(parts[0].content, /## Inside code/);
});
test('nested shorter fences and plain notes remain intact', () => {
  const parts = splitMarkdown(
    '````md\n```\n## Still a code example\n```\n````\n## Real\nA real section with enough content.',
    'Notes',
  );
  assert.deepEqual(
    parts.map((s) => s.title),
    ['Notes', 'Real'],
  );
  assert.equal(
    splitMarkdown('A plain note without headings but with useful content.', 'Notes')[0].title,
    'Notes',
  );
});

test('short Chinese definitions are preserved during import', () => {
  const parts = splitMarkdown('# 向量\n有序的数字序列。\n## 距离\n衡量两个向量差异的值。', '定义');
  assert.deepEqual(
    parts.map((part) => part.title),
    ['向量', '距离'],
  );
  assert.equal(parts[0].content, '有序的数字序列。');
});
