// Run with node scripts/check-learning-render.mjs (requires ego-browser).
// JIANZHI_CHECK_URL must point to a lesson with diagrams in an isolated STUDY_DATA_DIR.
// Set JIANZHI_CHECK_SPACE to resume an existing browser task space.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function check({ url, dataDir, space, reportPath }) {
  const { default: assert } = await import('node:assert/strict');
  const { writeFile } = await import('node:fs/promises');
  assert.ok(url && dataDir, 'Provide JIANZHI_CHECK_URL and an isolated STUDY_DATA_DIR');
  const bootstrap = await fetch(new URL('/api/bootstrap', url)).then((response) => response.json());
  assert.equal(bootstrap.storagePath, dataDir, 'The browser check must use the isolated learning space');

  const task = await taskSpace(space ? Number(space) : '渐知渲染回归检查');
  const page = task.page('p1');
  console.log({ taskSpaceId: task.spaceId });
  if ((await page.url()) === url) await page.reload();
  else await page.goto(url);
  await page.waitForSelector('button[aria-label="暂停计时"]');
  await page.click('button[aria-label="暂停计时"]');
  await page.waitForFunction(() => document.querySelectorAll('.diagram-image > svg').length >= 2, undefined, {
    timeout: 15000,
  });

  // Prepare a visible paragraph before selecting it, so intentional scrolling is
  // outside the measurement. A changed quote then exercises a parent re-render.
  await page.evaluate(() => {
    document.querySelector('.lesson-article .markdown > p').scrollIntoView({ block: 'center' });
  });
  const result = await page.evaluate(async () => {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await delay(400);
    const timer = document.querySelector('.timer > span');
    const diagrams = [...document.querySelectorAll('.diagram')];
    const svgs = diagrams.map((diagram) => diagram.querySelector('svg'));
    let removedDiagrams = 0;
    let removedToolbars = 0;
    const scrollTargets = [];
    const onScroll = (event) => scrollTargets.push(event.target.className || event.target.nodeName);
    window.addEventListener('scroll', onScroll, true);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (!(node instanceof Element)) continue;
          removedDiagrams += Number(node.matches('.diagram')) + node.querySelectorAll('.diagram').length;
          removedToolbars +=
            Number(node.matches('.selection-tools')) + node.querySelectorAll('.selection-tools').length;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    try {
      const paragraph = document.querySelector('.lesson-article .markdown > p');
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      await delay(500);
      const toolbar = document.querySelector('.selection-tools');
      const selectedText = selection.toString();
      const tickBefore = timer.textContent;
      document.querySelector('button[aria-label="继续计时"]').click();
      await delay(3400);
      const tickAfter = timer.textContent;
      const checks = {
        timerAdvanced: tickBefore !== tickAfter,
        diagramsPreserved: diagrams.every((diagram) => diagram.isConnected),
        svgPreserved: svgs.every((svg) => svg?.isConnected),
        toolbarPreserved: !!toolbar?.isConnected,
        selectionPreserved: !!selectedText && selection.toString() === selectedText,
        noDiagramRemovals: removedDiagrams === 0,
        noToolbarRemovals: removedToolbars === 0,
      };
      document.querySelector('button[aria-label="暂停计时"]').click();
      const pausedAt = timer.textContent;
      await delay(1200);
      checks.pauseWorks = timer.textContent === pausedAt;
      return { tickBefore, tickAfter, removedDiagrams, removedToolbars, scrollTargets, checks };
    } finally {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll, true);
    }
  });
  result.taskSpaceId = task.spaceId;
  await writeFile(reportPath, JSON.stringify(result, null, 2));
  if (!Object.values(result.checks).every(Boolean)) return false;

  // Input state also re-renders Learning; preserving these nodes must not depend
  // on the timer being paused or on a specific cause of the parent update.
  await page.evaluate(() => {
    window.__jianzhiRenderNodes = [...document.querySelectorAll('.diagram svg')];
  });
  await page.fill('#chat-question', '浏览器渲染检查，不发送请求。');
  result.checks.composerPreservesDiagrams = await page.evaluate(() =>
    window.__jianzhiRenderNodes.every((node) => node.isConnected),
  );
  await page.fill('#chat-question', '');
  await page.evaluate(() => {
    delete window.__jianzhiRenderNodes;
  });
  await writeFile(reportPath, JSON.stringify(result, null, 2));
  if (!result.checks.composerPreservesDiagrams) return false;
  console.log('PASS: timer, selection toolbar, pause, and composer rendering');
  if (!space) await task.finish({ keep: [] });
  return true;
}

const reportDir = mkdtempSync(path.join(os.tmpdir(), 'jianzhi-render-check-'));
const reportPath = path.join(reportDir, 'result.json');
const result = spawnSync('ego-browser', ['nodejs'], {
  input: `export {};\nawait (${check.toString()})(${JSON.stringify({
    url: process.env.JIANZHI_CHECK_URL,
    dataDir: process.env.STUDY_DATA_DIR,
    space: process.env.JIANZHI_CHECK_SPACE,
    reportPath,
  })});`,
  encoding: 'utf8',
  timeout: 60000,
});
if (result.error) console.error(result.error.message);
const output = (result.stdout || '') + (result.stderr || '');
process.stdout.write(output);
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
if (report) console.log(JSON.stringify(report, null, 2));
process.exitCode =
  result.status === 0 &&
  report?.checks.composerPreservesDiagrams &&
  Object.values(report.checks).every(Boolean)
    ? 0
    : 1;
rmSync(reportDir, { recursive: true, force: true });
