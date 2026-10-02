import type { SummaryCard } from '../shared/types';

export function parseSummary(
  output: string,
): Pick<SummaryCard, 'title' | 'takeaway' | 'points' | 'nextQuestion'> {
  try {
    const value = JSON.parse(output.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
    const text = (value: unknown, max: number) => {
      if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error();
      return value.trim();
    };
    if (!Array.isArray(value.points) || value.points.length !== 3) throw new Error();
    return {
      title: text(value.title, 60),
      takeaway: text(value.takeaway, 180),
      points: value.points.map((p: { title: unknown; body: unknown }) => ({
        title: text(p.title, 40),
        body: text(p.body, 180),
      })),
      nextQuestion: text(value.nextQuestion, 180),
    };
  } catch {
    throw new Error('总结格式不完整，请重试；尚未保存图卡。');
  }
}
