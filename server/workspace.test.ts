import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareWorkspace, resolveWorkspace } from './workspace';

test('workspace paths stay anchored to the app, protect legacy records and isolate overrides', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jianzhi-workspace-'));
  const app = path.join(dir, 'app');
  try {
    fs.mkdirSync(path.join(app, '.data'), { recursive: true });
    assert.equal(resolveWorkspace(app, ''), path.join(dir, '学习空间'));
    assert.throws(() => resolveWorkspace(app, 'relative'), /绝对路径/);
    const legacy = path.join(app, '.data/study.json');
    fs.writeFileSync(legacy, 'old records');
    assert.throws(() => resolveWorkspace(app, ''), /旧版/);
    assert.equal(fs.readFileSync(legacy, 'utf8'), 'old records');
    const isolated = path.join(dir, 'isolated');
    assert.equal(resolveWorkspace(app, isolated), isolated);
    prepareWorkspace(isolated, ['course-1', '../../escape']);
    fs.writeFileSync(path.join(isolated, 'topics/course-1/context/my-notes.md'), 'Keep this note');
    prepareWorkspace(isolated, ['course-1']);
    assert.equal(fs.existsSync(path.join(dir, 'escape')), false);
    assert.equal(
      fs.readFileSync(path.join(isolated, 'topics/course-1/context/my-notes.md'), 'utf8'),
      'Keep this note',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
