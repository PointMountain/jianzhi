import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

test('answer checking uses the lesson question and submitted answer with saved request settings', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jianzhi-recall-test-'));
  const binary = path.join(dir, 'codex');
  const trace = path.join(dir, 'request.json');
  fs.writeFileSync(
    binary,
    `#!${process.execPath}
if(process.argv.includes('--version')){console.log('codex-cli test');process.exit(0)}
if(process.argv.includes('login'))process.exit(0);
if(process.argv.includes('app-server')){
  require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
    const event=JSON.parse(line);
    if(event.method==='initialize') console.log(JSON.stringify({id:event.id,result:{}}));
    if(event.method==='model/list')console.log(JSON.stringify({id:event.id,result:{data:[{model:'test-model',displayName:'Test',isDefault:true,defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'high'}],serviceTiers:[{id:'priority'}]}]}}));
  });
}else{
  let prompt='';process.stdin.setEncoding('utf8');process.stdin.on('data',part=>prompt+=part);
  process.stdin.on('end',()=>{
    require('node:fs').writeFileSync(${JSON.stringify(trace)},JSON.stringify({prompt,args:process.argv}));
    console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'### 答对的部分\\n记录写入文件这一点正确。\\n### 需要修正或补充\\n刷新本身不会保存记录。'}}));
  });
}`,
    { mode: 0o700 },
  );
  process.env.STUDY_TEST = '1';
  process.env.STUDY_DATA_DIR = path.join(dir, 'study');
  process.env.STUDY_CODEX_BIN = binary;
  const { app } = await import('./index');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  async function send(route: string, body: unknown) {
    const response = await fetch(url + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  try {
    const created = await send('/courses', {
      title: '持久化',
      content: '# 写入文件\n服务先写临时文件，再原子替换。',
    });
    const courseId = created.data.courseId;
    const lesson = created.data.state.courses[0].lessons[0];
    assert.equal((await send('/model', { model: 'test-model', effort: 'max', fast: true })).status, 400);
    const settings = await send('/model', { model: 'test-model', effort: 'high', fast: true });
    assert.equal(settings.status, 200);
    assert.equal(settings.data.state.preferences.codexFast, true);
    const checked = await send('/recall-feedback', {
      courseId,
      lessonId: lesson.id,
      answer: '记录写入文件，所以刷新不会丢。',
    });
    assert.equal(checked.status, 200);
    assert.match(checked.data.feedback, /记录写入文件/);
    const actual = JSON.parse(fs.readFileSync(trace, 'utf8'));
    assert.ok(actual.prompt.includes(lesson.question));
    assert.ok(actual.prompt.includes('记录写入文件，所以刷新不会丢。'));
    assert.ok(actual.prompt.includes(lesson.content));
    assert.ok(actual.args.includes('model_reasoning_effort="high"'));
    assert.ok(actual.args.includes('service_tier="priority"'));
    const state = await (await fetch(url + '/export')).json();
    assert.deepEqual(state.progress, {});
    assert.deepEqual(state.reviews, []);
    assert.deepEqual(state.chats, {});
    assert.equal(state.completions, undefined);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
