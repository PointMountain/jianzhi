export const guidedActions = [
  'start',
  'answer',
  'hint',
  'explain',
  'transfer',
  'practice',
  'submit',
  'challenge',
  'material',
] as const;
export type GuidedAction = (typeof guidedActions)[number];
export type Guidance = 'hint' | 'explanation' | 'material' | 'discussion' | 'feedback';
export type StepKind = 'question' | 'hint' | 'explanation' | 'transfer' | 'practice' | 'feedback';

export interface GuidedStep {
  kind: StepKind;
  message: string;
  question: string;
  sourceQuote: string;
  assessment: null | {
    answerId: string;
    outcome: 'needs-work' | 'ready' | 'uncertain';
    supported: string[];
    gaps: string[];
  };
  nextStep: string;
  exercise: null | { title: string; goal: string; scaffold: string; checks: string[] };
}

export interface GuidedTurn {
  id: string;
  action: GuidedAction;
  content: string;
  createdAt: string;
  questionId?: string;
  assistance: Guidance[];
  status: 'pending' | 'complete' | 'error';
  response?: GuidedStep;
  error?: string;
}

export interface GuidedSession {
  id: string;
  courseId: string;
  lessonId: string;
  background: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  turns: GuidedTurn[];
  endedAt?: string;
}

export const actionLabels: Record<GuidedAction, string> = {
  start: '开始带学',
  answer: '我的回答',
  hint: '给一点提示',
  explain: '直接讲解',
  transfer: '换个情境验证',
  practice: '安排实作',
  submit: '我的实作提交',
  challenge: '追问或纠正',
  material: '查看原文',
};
export const stepLabels: Record<StepKind, string> = {
  question: '先想一个问题',
  hint: '一点线索',
  explanation: '补上这一块',
  transfer: '换个情境试试',
  practice: '动手实践',
  feedback: '一起核对',
};
export const guidanceLabels: Record<Guidance, string> = {
  hint: '用过提示',
  explanation: '看过讲解',
  material: '看过原文',
  discussion: '有过追问',
  feedback: '看过核对建议',
};

export function currentQuestion(session: GuidedSession) {
  return [...session.turns]
    .reverse()
    .find(
      (turn) =>
        turn.status === 'complete' &&
        turn.response &&
        ['question', 'transfer', 'practice'].includes(turn.response.kind),
    );
}

export function questionAssistance(session: GuidedSession): Guidance[] {
  const question = currentQuestion(session);
  if (!question) return [];
  // A transfer question starts fresh; the same turn may also grade the previous answer.
  const assistance = new Set<Guidance>();
  for (const turn of session.turns.slice(session.turns.indexOf(question) + 1)) {
    if (turn.questionId !== question.id || turn.status !== 'complete') continue;
    if (turn.response?.kind === 'hint') assistance.add('hint');
    if (turn.response?.kind === 'explanation') assistance.add('explanation');
    if (turn.action === 'material') assistance.add('material');
    if (turn.action === 'challenge') assistance.add('discussion');
    if (turn.response?.assessment) assistance.add('feedback');
  }
  return [...assistance];
}

export function guidedEvidence(session: GuidedSession) {
  const answers = session.turns.filter((t) => t.action === 'answer' || t.action === 'submit');
  const latestByQuestion = new Map<string, NonNullable<GuidedStep['assessment']>>();
  for (const turn of session.turns) {
    const assessment = turn.response?.assessment;
    if (!assessment) continue;
    const answer = answers.find((a) => a.id === (assessment.answerId || turn.id));
    if (answer?.questionId) latestByQuestion.set(answer.questionId, assessment);
  }
  const assessments = [...latestByQuestion.values()];
  const unanswered = session.turns.filter(
    (t) => t.response?.question && !answers.some((answer) => answer.questionId === t.id),
  );
  const lastResponse = [...session.turns].reverse().find((t) => t.response)?.response;
  return {
    answers,
    unassisted: answers.filter((t) => !t.assistance.length).length,
    assisted: answers.filter((t) => t.assistance.length).length,
    unanswered,
    // These remain attributed suggestions, never mastery or a review rating.
    supported: [...new Set(assessments.flatMap((a) => a.supported))],
    gaps: [...new Set(assessments.flatMap((a) => a.gaps))],
    nextStep: lastResponse?.nextStep || '从当前问题继续；也可以回看原文。',
  };
}

export function guidedTranscript(session: GuidedSession): string {
  const evidence = guidedEvidence(session);
  const lines = [
    `状态：${session.endedAt ? '本轮已结束' : '可以继续'}；开始于 ${session.createdAt}`,
    `实际提交 ${evidence.answers.length} 次；其中 ${evidence.assisted} 次有本题提示或参考记录。`,
    'AI 建议不代表掌握；实作运行结果由学习者提供，平台未执行代码。',
    '',
    ...(session.background ? [`学习背景：${session.background}`, ''] : []),
  ];
  for (const turn of session.turns) {
    if (turn.action === 'material') continue;
    lines.push(`### ${actionLabels[turn.action]} · ${turn.createdAt}`, '');
    if (turn.content) lines.push(turn.content, '');
    if (turn.action === 'answer' || turn.action === 'submit')
      lines.push(
        `本题帮助记录：${turn.assistance.length ? turn.assistance.map((a) => guidanceLabels[a]).join('、') : '未记录提示或参考'}`,
        '',
      );
    const step = turn.response;
    if (step) {
      lines.push(`**导师 · ${stepLabels[step.kind]}**`, '', step.message, '');
      if (step.question) {
        lines.push(`问题：${step.question}`, '');
        if (session.turns.some((t) => t.action === 'material' && t.questionId === turn.id))
          lines.push('本题参考记录：看过原文。', '');
      }
      if (step.sourceQuote) lines.push(`原文依据：${step.sourceQuote}`, '');
      if (step.assessment)
        lines.push(
          `AI 核对建议：${step.assessment.outcome}`,
          ...step.assessment.supported.map((v) => `- 有依据的部分：${v}`),
          ...step.assessment.gaps.map((v) => `- 待核对或补足：${v}`),
          '',
        );
      if (step.exercise)
        lines.push(
          `实作：${step.exercise.title}`,
          '',
          step.exercise.goal,
          '',
          step.exercise.scaffold,
          '',
          ...step.exercise.checks.map((c) => `- ${c}`),
          '',
        );
    }
    if (turn.status !== 'complete') lines.push(`回应状态：${turn.error || '等待回应'}；提交已保留。`, '');
  }
  lines.push(`下一步建议：${evidence.nextStep}`, '');
  return lines.join('\n');
}
