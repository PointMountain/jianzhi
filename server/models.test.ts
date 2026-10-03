import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('model discovery initializes JSONL protocol and handles paginated catalog without inference', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-local-models-'));
  const oldHome = process.env.CODEX_HOME;
  try {
    const binary = path.join(dir, 'codex');
    fs.writeFileSync(
      binary,
      `#!${process.execPath}
const rl=require('node:readline').createInterface({input:process.stdin});
rl.on('line',line=>{const e=JSON.parse(line); if(e.method==='initialize') console.log(JSON.stringify({id:e.id,result:{}}));
if(e.method==='model/list') console.log(JSON.stringify({id:e.id,result:{data:[{model:e.params.cursor?'custom-model':'default-model',displayName:'Model',isDefault:!e.params.cursor,defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'high'},{reasoningEffort:'unknown'}],serviceTiers:e.params.cursor?[]:[{id:'priority',name:'Fast'}]}],nextCursor:e.params.cursor?null:'page2'}}));});`,
      { mode: 0o700 },
    );
    process.env.STUDY_CODEX_BIN = binary;
    process.env.CODEX_HOME = dir;
    fs.writeFileSync(
      path.join(dir, 'config.toml'),
      'model = "global-model"\nmodel_provider="private"\n[providers.private]\nmodel="nested-model"\n',
    );
    const { listModels, globalModel, validModel, cachedDefaultModel } = await import('./models');
    assert.equal(globalModel(), 'global-model');
    assert.equal(validModel('--unsafe=value'), false);
    assert.equal(validModel('gpt-6-astra'), true);
    const catalog = await listModels();
    assert.deepEqual(
      catalog.map((m) => m.id),
      ['default-model', 'custom-model'],
    );
    assert.equal(cachedDefaultModel(), 'default-model');
    assert.deepEqual(catalog[0].reasoningEfforts, ['low', 'high']);
    assert.equal(catalog[0].defaultEffort, 'low');
    assert.equal(catalog[0].supportsFast, true);
    assert.equal(catalog[1].supportsFast, false);
    fs.writeFileSync(path.join(dir, 'config.toml'), '[providers.private]\nmodel="nested-model"\n');
    assert.equal(globalModel(), undefined);
  } finally {
    if (oldHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = oldHome;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
