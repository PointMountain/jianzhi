import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completedLessons, lessonCompletion } from '../shared/completions';
import type { StudyState } from '../shared/types';
import { schedule } from './domain';

test('version 1 practice history keeps its original completion date without mutation', () => {
  const state: StudyState = {
    version: 1,
    courses: [
      {
        id: 'c',
        title: 'Course',
        description: '',
        goal: '',
        source: '',
        createdAt: '',
        lessons: [{ id: 'l', title: 'Lesson', chapter: '', chapterIndex: 1, content: '', question: '' }],
      },
    ],
    progress: { 'c:l': schedule(undefined, 'hint', 'c', 'l', new Date('2026-10-03T01:00:00Z')) },
    reviews: [
      {
        id: 'r',
        courseId: 'c',
        lessonId: 'l',
        answer: 'A',
        rating: 'hint',
        createdAt: '2026-10-01T01:00:00Z',
        due: '2026-10-02',
        seconds: 0,
        revealed: true,
      },
    ],
    notes: [],
    chats: {},
    preferences: { dailyMinutes: 30 },
  };
  const before = structuredClone(state);
  assert.equal(lessonCompletion(state, 'c', 'l')?.createdAt, state.reviews[0].createdAt);
  assert.equal(completedLessons(state).length, 1);
  assert.deepEqual(state, before);
  state.completions = {
    'c:l': { courseId: 'c', lessonId: 'l', createdAt: '2026-09-30T00:00:00Z', source: 'reading' },
  };
  assert.equal(completedLessons(state).length, 1);
  assert.equal(completedLessons(state)[0].source, 'reading');
});
