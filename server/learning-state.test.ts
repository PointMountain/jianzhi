import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lessonStateKey,
  readLocal,
  recentLesson,
  writeLocal,
  acceptSnapshot,
  recentStateKey,
  legacyLessonValue,
} from '../src/learning-state';
import type { Bootstrap, Course } from '../shared/types';

test('browser recovery isolates learning spaces and ignores missing lessons or damaged storage', (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const formal = lessonStateKey('/formal', 'topic', 'one');
  const scratch = lessonStateKey('/scratch', 'topic', 'one');
  writeLocal(formal, 'formal draft');
  writeLocal(scratch, 'scratch draft');
  assert.equal(readLocal(formal, ''), 'formal draft');
  assert.equal(readLocal(scratch, ''), 'scratch draft');
  assert.notEqual(lessonStateKey('a:b', 'c', 'd'), lessonStateKey('a', 'b:c', 'd'));
  values.set('broken', '{incomplete');
  assert.equal(readLocal('broken', 'guided'), 'guided');
  const course: Course = {
    id: 'topic',
    title: 'topic',
    goal: 'goal',
    source: 'material',
    description: '',
    createdAt: '2026-10-04',
    lessons: [
      { id: 'one', title: 'one', chapter: 'chapter', chapterIndex: 1, content: 'material', question: 'why' },
    ],
  };
  values.set('draft:topic:one', 'older draft');
  assert.equal(legacyLessonValue('/formal', 'topic', 'one', 'draft'), 'older draft');
  assert.equal(legacyLessonValue('/scratch', 'topic', 'one', 'draft'), '');
  assert.notEqual(recentStateKey('/space:topic'), recentStateKey('/space', 'topic'));
  writeLocal(recentStateKey('/formal'), { courseId: 'topic', lessonId: 'deleted' });
  assert.equal(recentLesson('/formal', [course]), undefined);
  writeLocal(recentStateKey('/formal'), { courseId: 'topic', lessonId: 'one' });
  assert.equal(recentLesson('/formal', [course])?.lesson.id, 'one');
  assert.equal(recentLesson('/scratch', [course]), undefined);
  assert.equal(recentLesson('/formal', []), undefined);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('Storage is unavailable');
    },
  });
  assert.equal(readLocal('anything', 'fallback'), 'fallback');
  assert.doesNotThrow(() => writeLocal('anything', 'draft'));
});

test('late snapshots cannot roll back saved state, while legacy version 1 and another space still load', () => {
  const snapshot = (revision?: number, space = '/study'): Bootstrap => ({
    state: {
      version: 1,
      revision,
      courses: [],
      reviews: [],
      notes: [],
      progress: {},
      chats: {},
      preferences: { dailyMinutes: 30 },
    },
    codex: { available: false, authenticated: false, version: '' },
    today: '2026-10-04',
    storage: '本机',
    storagePath: space,
  });
  const old = snapshot();
  const latest = snapshot(2);
  assert.equal(acceptSnapshot(null, old), old);
  assert.equal(acceptSnapshot(old, latest), latest);
  assert.equal(acceptSnapshot(latest, snapshot(1)), latest);
  const different = snapshot(0, '/other');
  assert.equal(acceptSnapshot(latest, different), different);
});
