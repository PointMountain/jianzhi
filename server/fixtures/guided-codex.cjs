#!/usr/bin/env node
// Deterministic CLI fixture for isolated tests; never used by the normal application.
const fs = require('node:fs');
if (process.argv.includes('--version')) {
  console.log('codex-cli guided-fixture');
  process.exit(0);
}
if (process.argv.includes('login')) process.exit(0);
if (process.argv.includes('app-server')) {
  require('node:readline')
    .createInterface({ input: process.stdin })
    .on('line', (line) => {
      const event = JSON.parse(line);
      if (event.method === 'initialize') console.log(JSON.stringify({ id: event.id, result: {} }));
      if (event.method === 'model/list')
        console.log(
          JSON.stringify({
            id: event.id,
            result: {
              data: [
                {
                  model: 'test-model',
                  displayName: 'Test',
                  isDefault: true,
                  supportedReasoningEfforts: [{ reasoningEffort: 'low' }],
                },
              ],
            },
          }),
        );
    });
} else {
  let prompt = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (part) => (prompt += part));
  process.stdin.on('end', () => {
    const mode =
      process.env.GUIDED_FIXTURE_MODE && fs.existsSync(process.env.GUIDED_FIXTURE_MODE)
        ? fs.readFileSync(process.env.GUIDED_FIXTURE_MODE, 'utf8')
        : '';
    if (!prompt.includes('\n学习数据：')) {
      if (mode === 'chat-error') {
        console.error('Fixture request failed');
        process.exit(1);
      }
      const text =
        'AI Agent 会围绕目标选择工具、执行动作，并根据结果决定下一步。\n\n' +
        '普通问答主要生成回答；Agent 还需要观察行动结果、处理错误，并判断任务是否完成。可以从你熟悉的前端事件循环来理解这一区别。\n\n'.repeat(
          mode === 'chat-slow' ? 12 : 1,
        );
      setTimeout(
        () => console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } })),
        mode === 'chat-slow' ? 3000 : 10,
      );
      return;
    }
    const data = JSON.parse(prompt.split('\n学习数据：').at(-1));
    if (process.env.GUIDED_FIXTURE_TRACE)
      fs.appendFileSync(process.env.GUIDED_FIXTURE_TRACE, JSON.stringify(data) + '\n');
    let kind = data.allowedKinds[0];
    if (data.action === 'answer' && !data.content.includes('不知道'))
      kind = data.allowedKinds.includes('transfer') ? 'transfer' : 'feedback';
    if (data.action === 'challenge') kind = 'feedback';
    const result = {
      kind,
      message:
        kind === 'hint'
          ? '先区分模型提出请求和程序执行动作。哪一方能真正访问工具？'
          : kind === 'explanation'
            ? '程序负责调用工具，并把结果放回下一轮上下文。模型返回的 JSON 只是请求。再检查你的解释漏了哪一步。'
            : '我们围绕执行与回传的责任边界来判断。',
      question:
        kind === 'question'
          ? '模型返回 getWeather 的 JSON 后，程序还需要做什么才能回答真实天气？'
          : kind === 'transfer'
            ? '工具已经成功返回温度，模型却仍说不知道。你优先检查哪里，为什么？'
            : kind === 'practice'
              ? '请完成骨架中的关键逻辑，提交实现、运行结果和设计理由。'
              : '',
      sourceQuote:
        mode === 'bad-source'
          ? '原文完全不存在的伪造引用'
          : data.material.split('\n').filter(Boolean).at(-1).slice(0, 100),
      assessment: ['answer', 'submit'].includes(data.action)
        ? {
            outcome: data.content.includes('不知道') ? 'needs-work' : 'ready',
            supported: data.content.includes('不知道') ? [] : ['回答提到了检查执行和结果回传。'],
            gaps: data.content.includes('不知道') ? ['还需要区分谁执行工具。'] : [],
          }
        : null,
      nextStep: '尝试在新情境中解释工具结果如何进入下一轮上下文。',
      exercise:
        kind === 'practice'
          ? {
              title: '补全工具调用循环',
              goal: '在自己的编辑器中完成调用与回传，保留一次失败的真实记录。',
              scaffold:
                '```ts\nasync function runTool(call: {name: string}) {\n  // TODO: 检查工具，执行并返回结果\n}\n```',
              checks: ['成功时返回实际工具结果。', '失败时返回错误，不编造结果。'],
            }
          : null,
    };
    if (mode === 'fake-assessment' && data.action === 'hint')
      result.assessment = { outcome: 'ready', supported: ['没有回答也已掌握'], gaps: [] };
    if (data.action === 'challenge' && data.content.includes('纠正'))
      result.assessment = { outcome: 'ready', supported: ['复核原回答：已经明确说到了结果回传。'], gaps: [] };
    const text = mode === 'malformed' ? '{broken' : JSON.stringify(result);
    setTimeout(
      () => console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } })),
      mode === 'slow' ? 10000 : 10,
    );
  });
}
