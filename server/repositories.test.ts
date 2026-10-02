import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { scanRepository, importRepository, listDirectories } from './repositories';

test('repository import respects ignore rules, rejects changed files and preserves sources', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-local-repo-'));
  try {
    assert.equal(spawnSync('git', ['init', root]).status, 0);
    fs.writeFileSync(path.join(root, '.gitignore'), 'ignored.md\n');
    fs.writeFileSync(path.join(root, 'README.md'), '# 简介\n仓库用于测试。\n## 使用\n从入口开始。');
    fs.writeFileSync(path.join(root, 'index.ts'), 'const fence = "```";');
    fs.writeFileSync(path.join(root, 'ignored.md'), '不要读');
    fs.writeFileSync(path.join(root, '.env'), 'SECRET=hidden');
    fs.writeFileSync(path.join(root, 'credentials.json'), '{}');
    fs.mkdirSync(path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, 'node_modules', 'dep.js'), 'ignored');
    fs.symlinkSync(path.join(root, 'README.md'), path.join(root, 'link.md'));
    const before = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const scan = scanRepository(root);
    assert.deepEqual(
      scan.files.map((f) => f.path),
      ['README.md', 'index.ts'],
    );
    const course = importRepository(scan.id, ['README.md', 'index.ts'], '测试', '理解');
    assert.equal(course.lessons.length, 3);
    assert.equal(course.repository?.path, fs.realpathSync(root));
    assert.match(course.lessons[2].content, /^````typescript/);
    assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), before);
    assert.throws(() => importRepository(scan.id, ['../README.md'], '测试', ''), /不在/);
    assert.throws(() => importRepository('missing', ['README.md'], '测试', ''), /过期/);
    fs.unlinkSync(path.join(root, 'index.ts'));
    assert.throws(() => importRepository(scan.id, ['README.md', 'index.ts'], '测试', ''), /没有创建课程/);
    fs.unlinkSync(path.join(root, 'README.md'));
    fs.symlinkSync(path.join(root, 'ignored.md'), path.join(root, 'README.md'));
    assert.throws(() => importRepository(scan.id, ['README.md'], '测试', ''), /没有创建课程/);
    assert.equal(
      listDirectories(root).directories.some((d) => d.name === 'node_modules'),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('plain directory import rejects binary and oversized input without partial content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-local-text-'));
  try {
    fs.writeFileSync(path.join(root, 'binary.txt'), Buffer.from([0, 1, 2]));
    fs.writeFileSync(path.join(root, 'large.md'), 'a'.repeat(256001));
    const scan = scanRepository(root);
    assert.deepEqual(
      scan.files.map((f) => f.path),
      ['binary.txt'],
    );
    assert.throws(() => importRepository(scan.id, ['binary.txt'], '主题', ''), /UTF-8/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
