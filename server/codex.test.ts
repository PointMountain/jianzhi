import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('Codex adapter handles UTF-8 events, rejects concurrent runs, cancels and recovers', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shizhi-codex-test-'));
  const fake = path.join(dir, 'codex');
  fs.writeFileSync(
    fake,
    `#!${process.execPath}
if(process.argv.includes('--version')){console.log('codex-cli test');process.exit(0)}
if(process.argv.includes('login')){process.exit(0)}
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);
process.stdin.on('end',()=>{
 if(input==='slow'){setTimeout(()=>{},10000);return}
 if(input==='model'){console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:process.argv[process.argv.indexOf('--model')+1]}}));return}
 if(input==='unsupported'){console.log(JSON.stringify({type:'turn.failed',error:{message:"The model is not supported when using Codex with a ChatGPT account."}}));process.exitCode=1;return}
 const output=Buffer.from(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'中文回答已完成'}})+'\\n');
 const split=output.indexOf(Buffer.from('中'))+1;
 process.stdout.write(output.subarray(0,split));setTimeout(()=>process.stdout.write(output.subarray(split)),30);
});`,
    { mode: 0o700 },
  );
  process.env.STUDY_CODEX_BIN = fake;
  const { runCodex } = await import('./codex');
  try {
    assert.equal(await runCodex('normal'), '中文回答已完成');
    assert.equal(await runCodex('model', undefined, 'gpt-5.4'), 'gpt-5.4');
    await assert.rejects(runCodex('normal', undefined, '--bad=model'), /模型设置无效/);
    await assert.rejects(runCodex('unsupported', undefined, 'gpt-5.4'), /账号不支持所选模型（gpt-5.4）/);
    const controller = new AbortController();
    const pending = runCodex('slow', controller.signal);
    const stopped = assert.rejects(pending, /取消/);
    await assert.rejects(runCodex('another'), /另一个问题/);
    controller.abort();
    await stopped;
    assert.equal(await runCodex('normal'), '中文回答已完成');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
