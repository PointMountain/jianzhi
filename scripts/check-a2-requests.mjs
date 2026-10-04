// Requires the deterministic guided fixture, its mode file, and a fresh two-section test course.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
async function check({ url, dataDir, space, output }) {
  const fs = await import('node:fs/promises');
  const assert = (await import('node:assert/strict')).default;
  assert.ok(url && /jianzhi-a2-/.test(dataDir));
  const bootstrap = await fetch(new URL('/api/bootstrap', url)).then((r) => r.json());
  assert.equal(bootstrap.storagePath, dataDir);
  assert.ok(bootstrap.codex.version.includes('fixture'));
  const courseId = new URL(url).hash.split('/')[2];
  const fixture = { url: url.split('?')[0], courseId, space: dataDir };
  const task = await taskSpace(space ? Number(space) : '渐知请求恢复验收'),
    page = task.page('p1');
  const result = {};
  const mode = dataDir + '/mode';
  try {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 980,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.goto(fixture.url + '?guided');
    await page.waitForSelector('.guided-composer textarea');
    if (await page.evaluate(() => !!document.querySelector('.guided-error'))) {
      await page.click('text="重试本轮"');
      await page.waitForFunction(
        () => !document.querySelector('.guided-error') && !document.querySelector('.guided-panel .thinking'),
      );
    }
    await fs.writeFile(mode, 'slow');
    await page.evaluate(() => {
      document.querySelector('.lesson-article').scrollTop = 420;
      document.querySelector('.guided-conversation').scrollTop = 0;
    });
    await page.click('loc=role:button[name="给一点提示"]');
    await page.waitForSelector('.guided-panel .thinking');
    await page.click('text="专注阅读"');
    await page.waitForFunction(() => !document.querySelector('.guided-panel .thinking'), undefined, {
      timeout: 20000,
    });
    result.focusDoesNotCancel = await page.evaluate(
      () => document.querySelector('.is-focused') !== null && !document.querySelector('.guided-error'),
    );
    await page.click('#exit-reading-focus');
    result.newReplyDoesNotMoveReading = await page.evaluate(
      () =>
        document.querySelector('.lesson-article').scrollTop === 420 &&
        document.querySelector('.guided-conversation').scrollTop === 0,
    );
    await page.fill('.guided-composer textarea', '停止后保留这份草稿');
    await page.click('loc=role:button[name="给一点提示"]');
    await page.waitForSelector('.guided-panel .thinking');
    await page.click('text="停止本轮请求"');
    await page.waitForSelector('.guided-error');
    result.stopKeepsDraft = await page.evaluate(
      () => document.querySelector('.guided-composer textarea').value === '停止后保留这份草稿',
    );
    await fs.writeFile(mode, '');
    await page.click('text="重试本轮"');
    await page.waitForFunction(
      () => !document.querySelector('.guided-error') && !document.querySelector('.guided-panel .thinking'),
    );
    result.retryRecovers = true;
    await fs.writeFile(mode, 'slow');
    await page.click('loc=role:button[name="给一点提示"]');
    await page.waitForSelector('.guided-panel .thinking');
    await page.click('text="章节"');
    await page.click('[role="dialog"] .outline-chapter button:nth-of-type(2)');
    await page.click('text="导师带学"');
    await page.waitForSelector('.guided-intro');
    const state = await page.fetch('/api/bootstrap').then((r) => JSON.parse(r.body));
    result.lessonSwitchCancelsOldRequest = !state.state.guidedSessions.some(
      (s) => s.lessonId === 'section-1' && s.turns.some((t) => t.status === 'pending'),
    );
    result.newLessonUnaffected = await page.evaluate(
      () => location.hash.includes('section-2') && !!document.querySelector('.guided-intro'),
    );
    console.log(result);
  } finally {
    await fs.writeFile(mode, '');
    await fs.writeFile(output, JSON.stringify(result, null, 2));
  }

  assert.ok(Object.values(result).every(Boolean));
  if (!space) await task.finish({ keep: [] });
}
const result = spawnSync('ego-browser', ['nodejs'], {
  input: `export {};\nawait (${check.toString()})(${JSON.stringify({ url: process.env.JIANZHI_CHECK_URL, dataDir: process.env.STUDY_DATA_DIR, space: process.env.JIANZHI_CHECK_SPACE, output: path.resolve('artifacts/a2/request-final.json') })});`,
  encoding: 'utf8',
  timeout: 90000,
});
process.stdout.write((result.stdout || '') + (result.stderr || ''));
if (result.error) console.error(result.error);
process.exitCode = result.status === 0 ? 0 : 1;
