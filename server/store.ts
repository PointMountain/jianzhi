import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { StudyState } from '../shared/types';
import { prepareWorkspace, resolveWorkspace } from './workspace';
import { completedLessons } from '../shared/completions';

export const dataDir = resolveWorkspace();
const stateFile = path.join(dataDir, 'study.json');
function initialState(): StudyState {
  return {
    version: 1,
    courses: [],
    progress: {},
    reviews: [],
    notes: [],
    chats: {},
    preferences: { dailyMinutes: 30, codexModel: '' },
  };
}

fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
let state: StudyState = fs.existsSync(stateFile)
  ? JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  : initialState();
if (state.version !== 1 || !Array.isArray(state.courses))
  throw new Error('学习数据格式不兼容，请保留数据文件并检查版本。');

export function markdownExport(value = state): string {
  const lines = [
    '# 渐知 · 网页学习记录',
    '',
    `> 导出于 ${new Date().toISOString()}。此文件自动生成，请勿直接编辑；权威记录在学习空间根目录的 study.json。`,
    '',
    '## 学习主题',
    '',
  ];
  for (const c of value.courses) {
    const learned = Object.values(value.progress).filter((p) => p.courseId === c.id).length;
    lines.push(
      `### ${c.title}`,
      '',
      `目标：${c.goal}`,
      '',
      `来源：${c.source}`,
      '',
      `已练习 ${learned} / ${c.lessons.length} 个小节。`,
      '',
    );
  }
  lines.push('## 已学完的小节', '');
  for (const completion of completedLessons(value)) {
    const course = value.courses.find((c) => c.id === completion.courseId);
    const lesson = course?.lessons.find((l) => l.id === completion.lessonId);
    lines.push(
      `- ${course?.title} / ${lesson?.title} · ${completion.createdAt} · ${completion.source === 'review' ? '完成回忆练习' : '标记学完'}`,
      '',
    );
  }
  lines.push('## 笔记与疑问', '');
  for (const n of value.notes)
    lines.push(
      `### ${n.kind === 'question' ? '疑问' : '笔记'} · ${n.createdAt.slice(0, 10)}`,
      '',
      n.content,
      '',
      `状态：${n.resolved ? '已解决' : n.kind === 'question' ? '待解决' : '已记录'}`,
      '',
    );
  lines.push('## 回忆练习与复习', '');
  for (const r of value.reviews) {
    const c = value.courses.find((c) => c.id === r.courseId);
    const lesson = c?.lessons.find((l) => l.id === r.lessonId);
    lines.push(
      `### ${lesson?.title ?? r.lessonId} · ${r.createdAt}`,
      '',
      `题目：${lesson?.question ?? ''}`,
      '',
      `实际回答：${r.answer}`,
      '',
      `自评：${{ again: '尚未记住', hint: '需要提示', good: '能独立解释' }[r.rating]}；已查看材料：${r.revealed ? '是' : '否'}；下次复习：${r.due}`,
      '',
      ...(r.feedback ? ['核对反馈（Codex 生成，供参考）：', '', r.feedback, ''] : []),
    );
  }
  lines.push('## 学习总结图卡', '');
  for (const card of value.summaries ?? []) {
    const course = value.courses.find((c) => c.id === card.courseId);
    lines.push(
      `### ${card.title}`,
      '',
      `来源：${course?.title ?? card.courseId} / ${course?.lessons.find((l) => l.id === card.lessonId)?.title ?? card.lessonId}`,
      '',
      card.takeaway,
      '',
      ...card.points.flatMap((p) => [`**${p.title}**：${p.body}`, '']),
      `回忆题：${card.nextQuestion}`,
      '',
      'Codex 生成，请结合原文核对。',
      '',
    );
  }
  lines.push('## 共学对话', '');
  for (const [key, messages] of Object.entries(value.chats)) {
    lines.push(`### ${key}`, '');
    for (const m of messages) lines.push(`**${m.role === 'user' ? '我' : 'Codex'}**`, '', m.content, '');
  }
  return lines.join('\n');
}

function persist(next: StudyState) {
  const temp = `${stateFile}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(temp, stateFile);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  refreshWorkspace(next);
}

function refreshWorkspace(value: StudyState) {
  // The JSON is authoritative. A failed mirror must not discard a saved answer.
  const target = path.join(dataDir, 'exports/learning-notes.md');
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    prepareWorkspace(
      dataDir,
      value.courses.map((course) => course.id),
    );
    fs.writeFileSync(temp, markdownExport(value), { mode: 0o600 });
    fs.renameSync(temp, target);
  } catch {
    console.warn('学习空间目录或 Markdown 镜像未更新；study.json 中的记录仍已保存。');
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
if (!fs.existsSync(stateFile)) persist(state);
else refreshWorkspace(state);
export const getState = () => state;
export function updateState(change: (draft: StudyState) => void): StudyState {
  const next = structuredClone(state);
  change(next);
  persist(next);
  state = next;
  return state;
}
