// Run with JIANZHI_CHECK_URL, STUDY_DATA_DIR and optionally JIANZHI_CHECK_SPACE.
// URL is a lesson in an isolated space. This script does not create learning records.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

async function check({ url, dataDir, space, output }) {
  const assert = (await import('node:assert/strict')).default;
  const fs = await import('node:fs/promises');
  assert.ok(url && dataDir, 'Provide an isolated lesson URL and STUDY_DATA_DIR');
  const parsed = new URL(url);
  assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname));
  const bootstrap = await fetch(parsed.origin + '/api/bootstrap').then((r) => r.json());
  assert.equal(bootstrap.storagePath, dataDir, 'Refuse to inspect a different learning space');
  const lessonPath = parsed.hash.slice(1).split('?')[0];
  assert.ok(lessonPath.startsWith('/learn/'));
  const courseId = lessonPath.split('/')[2];
  const task = await taskSpace(space ? Number(space) : '渐知 A2 页面验收');
  const page = task.page('p1');
  console.log({ taskSpaceId: task.spaceId });
  const routes = [
    '/today',
    '/courses',
    '/course/' + courseId,
    '/map',
    '/reviews',
    '/notes',
    '/activity',
    '/activity?tab=guided',
    '/activity?tab=gallery',
    '/settings',
    '/new',
    lessonPath + '?guided',
    lessonPath + '?read',
    lessonPath + '?recall',
  ];
  const report = [];
  const contrast = [];
  for (const [width, height] of [
    [1440, 980],
    [1024, 900],
    [390, 844],
  ]) {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    for (const theme of ['light', 'dark']) {
      await page.goto(parsed.origin + '/#/today');
      await page.evaluate((value) => localStorage.setItem('jianzhi-theme', value), theme);
      for (const route of routes) {
        await page.goto(parsed.origin + '/#' + route);
        await page.waitForSelector('#main-content');
        const metrics = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          small: [...document.querySelectorAll('#root button')]
            .filter((b) => {
              const r = b.getBoundingClientRect();
              return (
                r.width &&
                r.height &&
                getComputedStyle(b).visibility !== 'hidden' &&
                (r.width < 43 || r.height < 43)
              );
            })
            .map((b) => b.textContent.trim().slice(0, 50)),
        }));
        report.push({ width, height, theme, route, ...metrics });
      }
      if (width === 1440)
        contrast.push(
          await page.evaluate(() => {
            const style = getComputedStyle(document.documentElement);
            const luminance = (name) => {
              const hex = style.getPropertyValue(name).trim().replace('#', '');
              const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
              const rgb = [0, 2, 4]
                .map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
                .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
              return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
            };
            const pairs = [
              ['--ink', '--bg'],
              ['--muted', '--panel'],
              ['--muted', '--soft'],
              ['--on-accent', '--accent'],
              ['--danger', '--danger-soft'],
              ['--green', '--green-soft'],
            ];
            return {
              theme: document.documentElement.dataset.theme,
              ratios: pairs.map(([text, surface]) => {
                const a = luminance(text),
                  b = luminance(surface);
                return { text, surface, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
              }),
            };
          }),
        );
      console.log({ width, theme, checked: report.length });
    }
  }
  const failures = report.filter((r) => r.scrollWidth > r.width || r.small.length);
  await fs.writeFile(output, JSON.stringify({ report, contrast, failures }, null, 2));
  if (!space) await task.finish({ keep: [] });
  assert.deepEqual(failures, []);
  assert.ok(
    contrast.every((theme) => theme.ratios.every((p) => p.ratio >= 4.5)),
    'Semantic text contrast >= 4.5:1',
  );
  console.log('PASS: 84 layout cases and 12 semantic contrast pairs');
}

mkdirSync('artifacts/a2', { recursive: true });
const result = spawnSync('ego-browser', ['nodejs'], {
  input: `export {};\nawait (${check.toString()})(${JSON.stringify({ url: process.env.JIANZHI_CHECK_URL, dataDir: process.env.STUDY_DATA_DIR, space: process.env.JIANZHI_CHECK_SPACE, output: path.resolve('artifacts/a2/layout-final.json') })});`,
  encoding: 'utf8',
  timeout: 120000,
});
process.stdout.write((result.stdout || '') + (result.stderr || ''));
if (result.error) console.error(result.error);
process.exitCode = result.status === 0 ? 0 : 1;
