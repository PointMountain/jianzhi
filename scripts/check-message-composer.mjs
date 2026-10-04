// Isolated browser regression for the shared composer and genuine unread replies.
// Use server/fixtures/guided-codex.cjs with GUIDED_FIXTURE_MODE=$STUDY_DATA_DIR/mode.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

async function check({ url, dataDir, space, output }) {
  const fs = await import('node:fs/promises');
  const assert = (await import('node:assert/strict')).default;
  const origin = new URL(url).origin;
  assert.ok(dataDir && /jianzhi-a2-/.test(dataDir));
  const initial = await fetch(origin + '/api/bootstrap').then((r) => r.json());
  assert.equal(initial.storagePath, dataDir);
  assert.ok(initial.codex.version.includes('fixture'), 'Use the deterministic CLI fixture');
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
  const created = await post('/courses', {
    title: '理解 Agent 的行动过程',
    content:
      '# 从回答到行动\n\nAI Agent 会围绕目标选择工具，执行动作并观察结果。普通聊天主要生成回答；能够采取行动以后，还需要检查工具返回的真实结果，并决定下一步。\n\n```mermaid\nflowchart LR\nA[目标] --> B[行动] --> C[观察]\n```\n\n```mermaid\nflowchart LR\nD[检查结果] --> E[下一步]\n```\n\n# 继续验证\n举一个自己熟悉的例子。',
    goal: '隔离输入组件验收',
  });
  const lesson = { courseId: created.courseId, lessonId: 'section-1' };
  await post('/tutor', { ...lesson, message: '先解释一下 Agent 与普通聊天的区别。' });
  const task = await taskSpace(space ? Number(space) : '渐知 输入组件与新回复提示');
  const page = task.page('p1');
  const lessonUrl = origin + '/#/learn/' + created.courseId + '/section-1?read';
  const result = { space: task.spaceId, url: lessonUrl, checks: {} };
  async function verify(name, value) {
    result.checks[name] = value;
    await fs.writeFile(output, JSON.stringify(result, null, 2));
    assert.ok(value, name);
  }
  console.log({ taskSpaceId: task.spaceId, url: lessonUrl });
  try {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 980,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.goto(lessonUrl);
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.diagram-image > svg').length === 2);
    await page.click('button[aria-label="展开右侧助手"]');
    await page.waitForSelector('#chat-question');
    await verify(
      'existingConversationIsNotNew',
      await page.evaluate(() => !document.querySelector('.new-chat-notice')),
    );
    await page.press('#chat-question', 'Escape');
    await page.evaluate(() => {
      const p = document.querySelector('.lesson-article .markdown > p');
      p.scrollIntoView({ block: 'center' });
    });
    await page.evaluate(() => {
      const p = document.querySelector('.lesson-article .markdown > p'),
        range = document.createRange();
      range.selectNodeContents(p);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForSelector('.selection-tools');
    await page.click('.selection-tools button:first-child');
    await verify(
      'quoteDoesNotCreateUnread',
      await page.evaluate(
        () => !!document.querySelector('.quote-preview') && !document.querySelector('.new-chat-notice'),
      ),
    );
    await page.evaluate(() => {
      window.__composerCalls = 0;
      const fetch = window.fetch;
      window.fetch = (...args) => {
        if (String(args[0]).includes('/api/tutor')) window.__composerCalls++;
        return fetch(...args);
      };
    });
    await page.fill('#chat-question', '这两个概念的边界在哪里？');
    await page.click('text="查看引用"');
    await page.waitForSelector('.quote-full-text');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.quote-full-text'));
    await page.click('button[aria-label="移除引用"]');
    await verify('quoteActionsNeverSubmit', await page.evaluate(() => window.__composerCalls === 0));
    await page.focus('#chat-question');
    await verify(
      'oneVisibleInputBoundary',
      await page.evaluate(() => {
        const e = document.querySelector('#chat-question'),
          s = getComputedStyle(e);
        return (
          s.borderTopWidth === '0px' &&
          s.boxShadow === 'none' &&
          getComputedStyle(e.closest('form')).outlineStyle !== 'none'
        );
      }),
    );
    await verify(
      'visibleInputLabel',
      await page.evaluate(() => !!document.querySelector('label[for="chat-question"]:not(.sr-only)')),
    );
    const compact = await page.evaluate(() => document.querySelector('#chat-question').clientHeight);
    await page.fill('#chat-question', '比较一次实际调用的结果。\n'.repeat(12));
    await verify(
      'inputGrowsWithinLimit',
      await page.evaluate((min) => {
        const h = document.querySelector('#chat-question').clientHeight;
        return h > min && h <= 180;
      }, compact),
    );
    await page.fill('#chat-question', '解释一下');
    await verify(
      'inputShrinksAgain',
      await page.evaluate((min) => document.querySelector('#chat-question').clientHeight === min, compact),
    );
    await page.press('#chat-question', 'Enter');
    await verify(
      'enterAddsNewline',
      await page.evaluate(
        () => document.querySelector('#chat-question').value.includes('\n') && window.__composerCalls === 0,
      ),
    );
    await page.evaluate(() =>
      document.querySelector('#chat-question').dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          ctrlKey: true,
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await verify('imeConfirmationNeverSends', await page.evaluate(() => window.__composerCalls === 0));
    await fs.writeFile(dataDir + '/mode', 'chat-slow');
    await page.press('#chat-question', 'Control+Enter');
    await page.waitForSelector('.message-composer button[type="button"]');
    await page.fill('#chat-question', '下一条问题的草稿');
    await page.waitForFunction(() => document.querySelectorAll('.chat-message').length === 4);
    await verify(
      'replyPreservesNextDraft',
      await page.evaluate(() => document.querySelector('#chat-question').value === '下一条问题的草稿'),
    );
    await verify(
      'visibleLatestReplyIsNotUnread',
      await page.evaluate(() => !document.querySelector('.new-chat-notice')),
    );
    await page.evaluate(async () => {
      document.querySelector('.chat-messages').scrollTop = 0;
      // Allow the browser's scroll event to update the reader's position before closing.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.waitForFunction(() => document.querySelector('.chat-messages').scrollTop === 0);
    await page.press('#chat-question', 'Escape');
    await page.click('button[aria-label="展开右侧助手"]');
    await verify(
      'reopenPreservesHistoryWithoutBadge',
      await page.evaluate(
        () =>
          document.querySelector('.chat-messages').scrollTop === 0 &&
          !document.querySelector('.new-chat-notice'),
      ),
    );
    await page.click('text="随手记"');
    await page.click('text="共学"');
    await verify(
      'tabSwitchDoesNotCreateUnread',
      await page.evaluate(() => !document.querySelector('.new-chat-notice')),
    );
    await page.click('button[aria-label="发送问题"]');
    await page.waitForFunction(() => document.querySelectorAll('.chat-message').length === 6);
    await verify(
      'genuineUnreadReplyIsMarked',
      await page.evaluate(
        () =>
          !!document.querySelector('.new-chat-notice') &&
          document.querySelector('.chat-messages').scrollTop === 0,
      ),
    );
    await page.click('.new-chat-notice');
    await verify(
      'viewLatestClearsUnread',
      await page.evaluate(() => !document.querySelector('.new-chat-notice')),
    );
    await page.fill('#chat-question', '面板关闭期间等待回答');
    await page.click('button[aria-label="发送问题"]');
    await page.press('#chat-question', 'Escape');
    await page.waitForFunction(() => !document.querySelector('.learning-shell[aria-busy="true"]'));
    await page.waitForFunction(
      async (key) => {
        const s = await fetch('/api/bootstrap').then((r) => r.json());
        return s.state.chats[key]?.length === 8;
      },
      created.courseId + ':section-1',
      { timeout: 15000 },
    );
    await page.click('button[aria-label="展开右侧助手"]');
    await page.waitForFunction(() => document.querySelectorAll('.chat-message').length === 8);
    await verify(
      'openingLatestClearsClosedPanelReply',
      await page.evaluate(() => !document.querySelector('.new-chat-notice')),
    );
    await fs.writeFile(dataDir + '/mode', 'chat-error');
    await page.fill('#chat-question', '失败时保留的问题');
    await page.click('button[aria-label="发送问题"]');
    await page.waitForSelector('.message-composer-error');
    await verify(
      'failureIsInlineAndKeepsDraft',
      await page.evaluate(
        () =>
          document.querySelector('#chat-question').value === '失败时保留的问题' &&
          document.querySelector('#chat-question').getAttribute('aria-invalid') === 'true',
      ),
    );
    await fs.writeFile(dataDir + '/mode', '');
    await page.click('button[aria-label="发送问题"]');
    await page.waitForFunction(() => document.querySelectorAll('.chat-message').length === 10);
    await verify(
      'retryClearsInlineError',
      await page.evaluate(() => !document.querySelector('.message-composer-error')),
    );
    await page.press('#chat-question', 'Escape');
    await verify(
      'timerHasPurposeLabel',
      await page.evaluate(
        () =>
          document.querySelector('.timer-label').textContent === '本次停留' &&
          document.querySelector('.timer').title.includes('提交回忆自评时保存'),
      ),
    );
    for (const [name, width, height, theme] of [
      ['desktop', 1440, 980, 'light'],
      ['mobile', 375, 812, 'dark'],
      ['short', 760, 480, 'light'],
    ]) {
      await page.cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await page.evaluate((theme) => localStorage.setItem('jianzhi-theme', theme), theme);
      await page.reload();
      await page.waitForSelector('button[aria-label="展开右侧助手"]');
      await page.click('button[aria-label="展开右侧助手"]');
      await page.fill('#chat-question', '继续追问这个例子');
      await verify(
        name + 'InputAccessible',
        await page.evaluate(() => {
          const r = document.querySelector('#chat-question').getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth;
        }),
      );
      if (name === 'short') {
        await verify(
          'shortWindowContentDoesNotOverlap',
          await page.evaluate(() => {
            const last = document.querySelector('.chat-message:last-child').getBoundingClientRect();
            return last.bottom <= document.querySelector('.message-composer').getBoundingClientRect().top;
          }),
        );
      }
      await page.screenshot({ path: output.replace('.json', '-' + name + '.png') });
      await page.press('#chat-question', 'Escape');
    }
  } finally {
    await fs.writeFile(dataDir + '/mode', '');
    await fs.writeFile(output, JSON.stringify(result, null, 2));
  }
  console.log(result);
  if (!space) await task.finish({ keep: [] });
}
mkdirSync('artifacts/composer', { recursive: true });
const result = spawnSync('ego-browser', ['nodejs'], {
  input: `export {};\nawait (${check.toString()})(${JSON.stringify({ url: process.env.JIANZHI_CHECK_URL, dataDir: process.env.STUDY_DATA_DIR, space: process.env.JIANZHI_CHECK_SPACE, output: path.resolve('artifacts/composer/checks.json') })});`,
  encoding: 'utf8',
  timeout: 180000,
});
process.stdout.write((result.stdout || '') + (result.stderr || ''));
if (result.error) console.error(result.error);
process.exitCode = result.status === 0 ? 0 : 1;
