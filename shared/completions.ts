import type { LessonCompletion, StudyState } from './types';

// Version 1 used the first recall record as lesson completion. Preserve that
// history without rewriting existing files or treating completion as mastery.
export function lessonCompletion(
  state: StudyState,
  courseId: string,
  lessonId: string,
): LessonCompletion | undefined {
  const key = `${courseId}:${lessonId}`;
  if (state.completions?.[key]) return state.completions[key];
  const progress = state.progress[key];
  if (!progress) return undefined;
  const review = state.reviews.find((r) => r.courseId === courseId && r.lessonId === lessonId);
  return { courseId, lessonId, createdAt: review?.createdAt ?? progress.lastReviewed, source: 'review' };
}

export const completedLessons = (state: StudyState): LessonCompletion[] =>
  state.courses.flatMap((c) =>
    c.lessons.flatMap((l) => {
      const completion = lessonCompletion(state, c.id, l.id);
      return completion ? [completion] : [];
    }),
  );
