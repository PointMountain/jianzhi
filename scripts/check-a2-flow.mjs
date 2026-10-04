// Uses only the deterministic CLI fixture and creates records in an explicitly isolated workspace.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

async function run({ url, dataDir, space, output }) {
  const fs = await import('node:fs/promises');
  const assert = (await import('node:assert/strict')).default;
  assert.ok(url && dataDir && /jianzhi-a2-/.test(dataDir), 'Provide an isolated jianzhi-a2- workspace');
  const origin = new URL(url).origin;
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
  const snapshot = await fetch(origin + '/api/bootstrap').then((r) => r.json());
  assert.equal(snapshot.storagePath, dataDir);
  assert.ok(
    snapshot.codex.version.includes('fixture'),
    'Run this check with server/fixtures/guided-codex.cjs; never spend account quota',
  );
  const post = async (route, body) => {
    const response = await fetch(origin + '/api' + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    assert.ok(response.ok, JSON.stringify(result));
    return result;
  };
  const material =
    '# 材料与判断\n' +
    '程序调用真实工具，并将工具结果追加到下一轮模型上下文。保留失败的证据，才知道下一步需要核对什么。\n\n'.repeat(
      18,
    ) +
    '\n```mermaid\nflowchart LR\nA[提出问题] --> B[收集证据]\n```\n\n```mermaid\nflowchart LR\nC[检查条件] --> D[解释结果]\n```\n\n# 第二个小节\n换一个情境检验理解，也记录暂时不能解释的地方。';
  const created = await post('/courses', {
    title: 'A2 连续性验收',
    content: material,
    goal: '浏览器行为测试示例',
  });
  const fixture = {
    space: dataDir,
    courseId: created.courseId,
    url: origin + '/#/learn/' + created.courseId + '/section-1',
  };
  await post('/guided/start', {
    courseId: fixture.courseId,
    lessonId: 'section-1',
    requestId: crypto.randomUUID(),
    background: '这是隔离的浏览器验收材料。',
  });
  const task = await taskSpace(space ? Number(space) : '渐知 A2 连续性验收'),
    page = task.page('p1');
  console.log({ taskSpaceId: task.spaceId, courseId: fixture.courseId });
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 980,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const checks = {};
  function check(name, value) {
    checks[name] = value;
    console.log(name, value);
    if (!value) throw Error(name);
  }
  try {
    await page.goto(fixture.url + '?guided');
    await page.reload(); // The fixture was created through the API after this tab's last bootstrap.
    await page.waitForSelector('.guided-composer textarea');
    check(
      'currentQuestionShownOnce',
      await page.evaluate(() => {
        const question = document.querySelector('.current-question').textContent;
        return document.querySelector('.guided-panel').textContent.split(question).length === 2;
      }),
    );
    check(
      'tutorContentHasNoNestedScroll',
      await page.evaluate(() =>
        [...document.querySelectorAll('.guided-conversation, .current-question')].every(
          (element) => element.scrollHeight <= element.clientHeight + 1,
        ),
      ),
    );
    await page.fill('.guided-composer textarea', '跨视图草稿 A');
    await page.evaluate(() => {
      const p = document.querySelector('.lesson-article');
      p.scrollTop = 300;
      window.__a2Article = p;
    });
    await page.click('text="专注阅读"');
    await page.click('text="章节"');
    await page.press('[role="dialog"] button[aria-label="关闭"]', 'Escape');
    check(
      'nestedEscKeepsFocus',
      await page.evaluate(() => document.body.classList.contains('reading-focus')),
    );
    await page.press('#exit-reading-focus', 'Escape');
    await page.waitForFunction(() => document.activeElement?.textContent === '专注阅读');
    check(
      'focusRestoresDraftScrollAndNode',
      await page.evaluate(
        () =>
          document.querySelector('.guided-composer textarea').value === '跨视图草稿 A' &&
          document.querySelector('.lesson-article') === window.__a2Article &&
          document.querySelector('.lesson-article').scrollTop === 300,
      ),
    );
    await page.click('text="自主阅读"');
    await page.click('button[aria-label="展开右侧助手"]');
    check(
      'emptyAssistantHasNoClippedContent',
      await page.evaluate(() => {
        const chat = document.querySelector('.chat-messages');
        const body = document.querySelector('.assistant-dialog .modal-body');
        return chat.scrollHeight <= chat.clientHeight + 1 && body.scrollHeight <= body.clientHeight + 1;
      }),
    );
    await page.fill('#chat-question', '未发送的问题 A');
    await page.click('text="随手记"');
    await page.fill('#personal-note', '未保存的笔记 A');
    await page.press('#personal-note', 'Escape');
    await page.reload();
    await page.waitForSelector('.mode-read');
    check('modeRestoredAfterReload', true);
    await page.click('button[aria-label="展开右侧助手"]');
    check(
      'chatDraftRestored',
      await page.evaluate(() => document.querySelector('#chat-question').value === '未发送的问题 A'),
    );
    await page.click('text="随手记"');
    check(
      'noteDraftRestored',
      await page.evaluate(() => document.querySelector('#personal-note').value === '未保存的笔记 A'),
    );
    await page.press('#personal-note', 'Escape');
    await page.click('text="章节"');
    await page.click('[role="dialog"] .outline-chapter button:nth-of-type(2)');
    await page.waitForSelector('.mode-guided .guided-intro');
    check('newLessonDefaultsGuided', true);
    await page.click('text="自主阅读"');
    await page.click('.sidebar nav a[href="#/today"]');
    await page.waitForSelector('.resume-paper');
    check(
      'todayShowsRecentLesson',
      await page.evaluate(() => document.querySelector('.resume-paper').textContent.includes('第二个小节')),
    );
    await page.click('.resume-paper .primary');
    await page.waitForSelector('.mode-read');
    check('continueRestoresLessonAndMode', (await page.url()).includes('/section-2?read'));
    await page.goto(fixture.url + '?read');
    await page.waitForSelector('.completion-toggle');
    await page.click('.completion-toggle');
    await page.waitForSelector('[role="dialog"]');
    check(
      'completionOffersAllExits',
      await page.evaluate(() =>
        ['今天先到这里', '主动回忆', '下一小节'].every((text) =>
          document.querySelector('[role="dialog"]').textContent.includes(text),
        ),
      ),
    );
    const completed = await page.fetch('/api/bootstrap').then((r) => JSON.parse(r.body));
    check('completionDoesNotInventReview', completed.state.reviews.length === created.state.reviews.length);
    await page.press('[role="dialog"] button[aria-label="关闭"]', 'Escape');
    await page.goto(fixture.url + '?recall');
    await page.waitForSelector('.recall-panel');
    await page.fill('.recall-panel .answer-label textarea', '我解释材料与证据的关系。');
    await page.click('text="专注阅读"');
    await page.click('#exit-reading-focus');
    await page.click('text="提交解释并核对"');
    await page.waitForSelector('.feedback-box');
    await page.waitForFunction(() => !document.querySelector('.feedback-box .thinking'));
    check(
      'materialBlocksIndependentRating',
      await page.evaluate(() => document.querySelectorAll('.rating-buttons button')[2].disabled),
    );
    const before = await page.fetch('/api/bootstrap').then((r) => JSON.parse(r.body));
    await page.click('.rating-buttons button:nth-child(2)');
    const selected = await page.fetch('/api/bootstrap').then((r) => JSON.parse(r.body));
    check('ratingSelectionDoesNotSave', before.state.reviews.length === selected.state.reviews.length);
    await page.click('text="保存本次结果"');
    await page.waitForSelector('.success-panel');
    const after = await page.fetch('/api/bootstrap').then((r) => JSON.parse(r.body));
    check(
      'explicitSavePersistsOneReview',
      after.state.reviews.length === before.state.reviews.length + 1 &&
        after.state.reviews.at(-1).rating === 'hint',
    );
    await page.goto(fixture.url + '?guided');
    await page.waitForSelector('.guided-composer textarea');
    check(
      'guidedDraftSurvivesOtherLesson',
      await page.evaluate(() => document.querySelector('.guided-composer textarea').value === '跨视图草稿 A'),
    );
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.click('text="展开全文"');
    check(
      'mobileFullTextDoesNotChangeMode',
      await page.evaluate(() => document.querySelector('.mode-guided.is-focused') !== null),
    );
    await page.click('#exit-reading-focus');
    check(
      'mobileReturnKeepsDraft',
      await page.evaluate(() => document.querySelector('.guided-composer textarea').value === '跨视图草稿 A'),
    );
    await page.click('text="导航"');
    await page.click('[aria-label="窄屏导航"] a[href="#/new"]');
    await page.waitForSelector('.create-page:not([hidden])');
    await page.click('text="导入材料"');
    await page.fill('.create-page input[required]', '导入草稿');
    await page.fill('.create-page textarea', '需要保留的原始材料正文。');
    await page.click('text="从主题开始"');
    await page.fill('.create-page input[required]', '主题草稿');
    await page.click('text="本地仓库"');
    await page.fill('input[aria-label="仓库绝对路径"]', '/tmp/never-read');
    await page.click('text="导入材料"');
    check(
      'importDraftSurvivesModeSwitch',
      await page.evaluate(
        () =>
          document.querySelector('.create-page input[required]').value === '导入草稿' &&
          document.querySelector('.create-page textarea').value === '需要保留的原始材料正文。',
      ),
    );
    await page.click('text="本地仓库"');
    check(
      'repositoryPathSurvivesModeSwitch',
      await page.evaluate(
        () => document.querySelector('input[aria-label="仓库绝对路径"]').value === '/tmp/never-read',
      ),
    );
  } finally {
    await fs.writeFile(output, JSON.stringify(checks, null, 2));
    if (!space) await task.finish({ keep: [] });
  }
}
mkdirSync('artifacts/a2', { recursive: true });
const result = spawnSync('ego-browser', ['nodejs'], {
  input: `export {};\nawait (${run.toString()})(${JSON.stringify({ url: process.env.JIANZHI_CHECK_URL, dataDir: process.env.STUDY_DATA_DIR, space: process.env.JIANZHI_CHECK_SPACE, output: path.resolve('artifacts/a2/flow-final.json') })});`,
  encoding: 'utf8',
  timeout: 120000,
});
process.stdout.write((result.stdout || '') + (result.stderr || ''));
if (result.error) console.error(result.error);
process.exitCode = result.status === 0 ? 0 : 1;
