import { useEffect, useState } from 'react';
import type { Bootstrap, Course } from '../shared/types';

export function acceptSnapshot(previous: Bootstrap | null, incoming: Bootstrap | null) {
  if (
    previous &&
    incoming &&
    previous.storagePath === incoming.storagePath &&
    (incoming.state.revision ?? 0) < (previous.state.revision ?? 0)
  )
    return previous;
  return incoming;
}

export function localText(key: string, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
export function storeText(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* Current inputs remain usable if browser storage is restricted. */
  }
}

// Browser presentation state is separate from study.json and scoped to its learning space.
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Restricted or full browser storage must not prevent the current study session.
  }
}
export const lessonStateKey = (space: string, course: string, lesson: string) =>
  `jianzhi:learning:${JSON.stringify([space, course, lesson])}`;
export const recentStateKey = (space: string, course?: string) =>
  `jianzhi:recent:${JSON.stringify([space, course ?? null])}`;

// A pre-A2 draft has no space identifier. Claim it once, then never offer it to another space.
export function legacyLessonValue(space: string, course: string, lesson: string, prefix: string) {
  const key = `jianzhi:legacy-owner:${JSON.stringify([course, lesson])}`;
  if (!localText(key)) storeText(key, space);
  return localText(key) === space ? localText(`${prefix}:${course}:${lesson}`) : '';
}

export function useLessonDraft(key: string, fallback = '') {
  const [value, setValue] = useState(() => {
    const saved = readLocal<unknown>(key, fallback);
    return typeof saved === 'string' ? saved : fallback;
  });
  useEffect(() => writeLocal(key, value), [key, value]);
  return [value, setValue] as const;
}

export function recentLesson(space: string, courses: Course[], courseId?: string) {
  const saved = readLocal<unknown>(recentStateKey(space, courseId), null);
  if (!saved || typeof saved !== 'object') return;
  const entry = saved as { courseId?: unknown; lessonId?: unknown };
  const course = courses.find((c) => c.id === entry.courseId && (!courseId || c.id === courseId));
  const lesson = course?.lessons.find((l) => l.id === entry.lessonId);
  return course && lesson ? { course, lesson } : undefined;
}
