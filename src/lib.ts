import type { Bootstrap, Course, StudyState } from '../shared/types';
import { lessonCompletion } from '../shared/completions';
import { recentLesson } from './learning-state';
export async function request<T = Bootstrap>(
  url: string,
  body?: unknown,
  method = 'POST',
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method: body === undefined ? 'GET' : method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => {
    throw new Error('学习服务暂时没有回应，请确认本地服务仍在运行，再重试。');
  });
  if (!res.ok) throw new Error(data.error || '请求没有完成，请重试。');
  return data;
}
export const keyFor = (c: string, l: string) => `${c}:${l}`;
export const toLesson = (course: Course, state: StudyState, space?: string) => {
  const next =
    (space && recentLesson(space, [course], course.id)?.lesson) ||
    course.lessons.find((l) => !lessonCompletion(state, course.id, l.id)) ||
    course.lessons[0];
  return `/learn/${course.id}/${next.id}`;
};
export const courseProgress = (c: Course, s: StudyState) =>
  c.lessons.filter((l) => lessonCompletion(s, c.id, l.id)).length;
export const formatDay = (date: string) =>
  new Date(date.length === 10 ? `${date}T12:00:00+08:00` : date).toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Shanghai',
  });
export const dayKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
export function daysEnding(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(`${today}T12:00:00+08:00`);
    d.setDate(d.getDate() - count + i + 1);
    return dayKey(d);
  });
}
