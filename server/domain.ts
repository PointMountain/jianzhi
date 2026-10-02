import type { Progress, Rating } from '../shared/types';

export function localDay(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return localDay(date);
}
export const progressKey = (courseId: string, lessonId: string) => `${courseId}:${lessonId}`;
export function schedule(
  previous: Progress | undefined,
  rating: Rating,
  courseId: string,
  lessonId: string,
  now = new Date(),
): Progress {
  const today = localDay(now);
  const intervals = [1, 3, 7, 14, 30];
  // A second answer on the same day is practice, not delayed recall.
  const laterDay = previous && localDay(new Date(previous.lastReviewed)) < today && previous.due <= today;
  const stage =
    rating === 'good' && laterDay
      ? Math.min(previous.stage + 1, intervals.length - 1)
      : rating === 'good' && previous
        ? previous.stage
        : 0;
  const independentDates =
    rating === 'good' ? Array.from(new Set([...(previous?.independentDates ?? []), today])) : [];
  const due =
    rating === 'good' && previous && previous.due > today ? previous.due : addDays(today, intervals[stage]);
  return {
    courseId,
    lessonId,
    stage,
    due,
    rating,
    lastReviewed: now.toISOString(),
    attempts: (previous?.attempts ?? 0) + 1,
    independentDates,
  };
}

// Ignore headings inside fenced examples; each heading starts a small reading unit.
export function splitMarkdown(markdown: string, fallback: string): { title: string; content: string }[] {
  const sections: { title: string; lines: string[] }[] = [];
  let current = { title: fallback, lines: [] as string[] };
  let fence = '';
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = '';
    }
    const heading = !fence && line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      if (current.lines.join('\n').trim()) sections.push(current);
      current = { title: heading[1].replace(/\s*\{[^}]*\}\s*$/, '').trim(), lines: [] };
    } else current.lines.push(line);
  }
  if (current.lines.join('\n').trim()) sections.push(current);
  return sections
    .map((s) => ({ title: s.title, content: s.lines.join('\n').trim() }))
    .filter((s) => s.content.length > 0);
}
