import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'my-emotion-map.app-data.v1';
const SUPABASE_AUTH_STORAGE_KEY = 'sb-uifgpmmlvmfrauzbbrem-auth-token';
const DEMO_PROFILE_ID = '7c5e2f8a-4c6f-4c1d-9b2f-2a6f5e8d2026';

async function seedAuthenticatedSession(page: Page, includeBlankData: boolean) {
  await page.route(
    'https://uifgpmmlvmfrauzbbrem.supabase.co/rest/v1/**',
    async (route) => {
      const isSave = route.request().url().includes('/rpc/save_app_state');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(isSave ? [{ revision: 1 }] : []),
      });
    },
  );
  await page.addInitScript(({ storageKey, authStorageKey, blank }) => {
    if (window.sessionStorage.getItem('e2e-storage-initialized')) return;
    window.localStorage.clear();
    window.localStorage.setItem(authStorageKey, JSON.stringify({
      access_token: 'e2e-access-token',
      refresh_token: 'e2e-refresh-token',
      expires_in: 315360000,
      expires_at: Math.floor(Date.now() / 1000) + 315360000,
      token_type: 'bearer',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'internal-account-identifier',
        user_metadata: { account_id: 'e2e_student' },
        app_metadata: { provider: 'email', providers: ['email'] },
        created_at: '2026-08-01T00:00:00.000Z',
      },
    }));
    if (blank) {
      window.localStorage.setItem(storageKey, JSON.stringify({
        schemaVersion: 3,
        dataMode: 'real',
        moments: [],
        notes: [],
        conversations: [],
        followUps: [],
        revisits: [],
        starInboxItems: [],
      }));
    }
    window.sessionStorage.setItem('e2e-storage-initialized', 'true');
  }, {
    storageKey: STORAGE_KEY,
    authStorageKey: SUPABASE_AUTH_STORAGE_KEY,
    blank: includeBlankData,
  });
}

async function startBlank(page: Page) {
  await seedAuthenticatedSession(page, true);
  await page.goto('/');
  await expect(page.locator('.map-screen')).toBeVisible();
}

async function dragNewStarToMap(page: Page) {
  const star = page.getByRole('button', {
    name: '点击在当前位置添加星星，或拖到地图上放置',
  });
  const box = await star.boundingBox();
  if (!box) throw new Error('Star tool is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(180, 360, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole('dialog', { name: '给这一刻起个名字' })).toBeVisible();
}

async function completeEditor(page: Page, title: string) {
  await page.getByRole('textbox', { name: '给这一刻起个名字' }).fill(title);
  await page.getByRole('button', { name: '平静' }).click();
  await page.getByTitle('有点不舒服').click();
  await page.getByRole('button', { name: '愿意不定期后续回访' }).click();
  await page.getByRole('button', { name: '继续到引导问题' }).click();

  for (const [question, answer] of [
    ['你去这做什么？', '安静地完成作业。'],
    ['这里有什么让你注意到的？', '可以慢慢集中注意力。'],
    ['你想为以后留下什么？', '靠窗的位置比较安静。'],
  ] as const) {
    await page.getByRole('textbox', { name: question }).fill(answer);
    await page
      .getByRole('button', {
        name:
          question === '你想为以后留下什么？'
            ? '完成引导问题'
            : '下一题',
      })
      .click();
  }
  await page.getByRole('button', { name: '点击保存' }).click();
  await expect(page.getByText('这颗星星已经记下来了')).toBeVisible();
}

async function openCalendar(page: Page) {
  await page.getByRole('button', { name: '打开页面导航' }).click();
  await page.getByRole('button', { name: '记录日历' }).click();
  await expect(page.getByRole('dialog', { name: '记录日历' })).toBeVisible();
}

test('login uses account and password without an email field', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My Emotion Map' })).toBeVisible();
  await expect(page.getByLabel('账号')).toBeVisible();
  await expect(page.getByLabel('密码')).toBeVisible();
  await expect(page.getByLabel('邮箱')).toHaveCount(0);
  await page.getByRole('button', { name: '注册' }).click();
  await expect(page.getByLabel('再次输入密码')).toBeVisible();
});

test('authenticated preview shows labelled Demo content and a fictional profile', async ({
  page,
}) => {
  await seedAuthenticatedSession(page, false);
  await page.goto('/');

  await expect(page.locator('.demo-mode-banner')).toContainText('演示数据');
  expect(await page.locator('.map-star-button').count()).toBeGreaterThan(0);

  await page.getByRole('button', { name: '打开页面导航' }).click();
  const drawer = page.getByRole('dialog', { name: '页面导航' });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole('button', { name: '关闭' }),
  ).toHaveCount(0);
  await drawer.getByRole('button', { name: '设置' }).click();

  await expect(page.getByText('Mina Park')).toBeVisible();
  await expect(page.getByText(DEMO_PROFILE_ID)).toBeVisible();
  await page.getByRole('button', { name: '修改个人信息' }).click();
  await expect(
    page.getByRole('textbox', { name: '用户 ID' }),
  ).toHaveValue(DEMO_PROFILE_ID);
});

test('blank new user, keyboard sheets, and accessibility smoke', async ({
  page,
}) => {
  await startBlank(page);

  await expect(page.locator('.map-star-button')).toHaveCount(0);
  await expect(page.locator('.demo-mode-banner')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: /定位/ })).toHaveCount(0);

  const menu = page.getByRole('button', { name: '打开页面导航' });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '页面导航' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '页面导航' })).toHaveCount(0);
  await expect(menu).toBeFocused();

  await menu.click();
  await page.getByRole('button', { name: '交流回访' }).click();
  await expect(page.locator('.chat-screen')).toBeVisible();
  await expect(
    page.getByText('发送第一条消息后，这段对话才会保存。'),
  ).toBeVisible();
  await expect(page.locator('.message-row')).toHaveCount(0);
  await expect(page.locator('.composer-row > *')).toHaveCount(2);
  await page.getByRole('button', { name: '返回地图并打开导航' }).click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await expect(page.getByRole('dialog', { name: '页面导航' })).toBeVisible();
  await page.keyboard.press('Escape');

  await openCalendar(page);
  const calendarActions = page.locator('.calendar-header-actions > button');
  await expect(calendarActions).toHaveCount(2);
  const [calendarModeBox, calendarCloseBox] = await Promise.all([
    calendarActions.nth(0).boundingBox(),
    calendarActions.nth(1).boundingBox(),
  ]);
  expect(calendarModeBox).not.toBeNull();
  expect(calendarCloseBox).not.toBeNull();
  expect(
    Math.abs(
      (calendarModeBox?.y ?? 0) - (calendarCloseBox?.y ?? 0),
    ),
  ).toBeLessThan(2);
  expect(calendarCloseBox?.x).toBeGreaterThan(
    (calendarModeBox?.x ?? 0) + (calendarModeBox?.width ?? 0),
  );
  await page
    .getByRole('dialog', { name: '记录日历' })
    .getByRole('button', { name: '关闭' })
    .click();

  const search = page.getByRole('button', { name: '搜索记录或坐标' });
  await search.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '搜索记录或坐标' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: '搜索记录或坐标' }),
  ).toHaveCount(0);
  await expect(search).toBeFocused();

  const results = await new AxeBuilder({ page })
    .disableRules(['color-contrast'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('add, complete, reopen, revisit, persist, delete and undo', async ({
  page,
}) => {
  test.setTimeout(75_000);
  await startBlank(page);
  await dragNewStarToMap(page);
  await completeEditor(page, 'E2E 安静角落');

  await expect(page.locator('.map-star-button')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.map-star-button')).toHaveCount(1);

  await openCalendar(page);
  await page
    .getByRole('button', { name: /1条记录/ })
    .first()
    .click();
  await page.getByRole('button', { name: /E2E 安静角落/ }).click();
  await expect(page.getByRole('dialog', { name: '星星记录' })).toContainText(
    'E2E 安静角落',
  );
  await page
    .getByRole('dialog', { name: '星星记录' })
    .getByLabel('关闭')
    .click();
  await page
    .getByRole('dialog', { name: '记录日历' })
    .getByRole('button', { name: '关闭' })
    .click();

  await page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) throw new Error('Saved app data was not found');
    const snapshot = JSON.parse(raw);
    snapshot.followUps[0].dueAt = '2026-07-27T00:00:00.000Z';
    snapshot.followUps[0].status = 'queued';
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, STORAGE_KEY);
  await page.reload();

  await page.getByRole('button', { name: /打开星星信箱/ }).click();
  await page
    .locator('.star-inbox-card--follow-up')
    .first()
    .click();
  await page
    .getByRole('button', { name: '现在回看，我仍然很喜欢这段经历。' })
    .click();
  await expect(
    page.getByRole('dialog', { name: /现在想起/ }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: '开心' })
    .click();
  await page.getByRole('button', { name: '记录现在的感受' }).click();

  await page.reload();
  await page.locator('.map-star-button').click();
  await page.getByRole('button', { name: '查看星星记录' }).click();
  await page.getByRole('button', { name: '回访记录' }).click();
  await expect(page.getByText('情绪重访历史')).toBeVisible();
  await page
    .getByRole('dialog', { name: '星星记录' })
    .getByLabel('关闭')
    .click();

  await expect(
    page.getByRole('button', { name: '删除星星' }),
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '删除星星' }).click();
  await expect(page.locator('.map-star-button')).toHaveCount(0);
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.locator('.map-star-button')).toHaveCount(1);
});

test('320px core flow and reduced-motion map behavior', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startBlank(page);
  await dragNewStarToMap(page);
  await expect(page.getByRole('dialog', { name: '给这一刻起个名字' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '关闭并保存为正式记录' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '关闭并保存为正式记录' }).click();
  await expect(page.getByRole('dialog', { name: '给这一刻起个名字' })).toHaveCount(0);
  await expect(page.locator('.map-star-button')).toHaveCount(1);
  const stored = await page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);
  expect(stored.notes[0]).toMatchObject({
    emotion: null,
    placeRating: null,
    isDraft: false,
  });

  const animationDuration = await page.locator('.map-screen').evaluate(
    (element) => getComputedStyle(element).animationDuration,
  );
  expect(['0s', '0.01ms', '1e-05s']).toContain(animationDuration);
});

test('tablet, landscape, desktop, and 200% zoom layouts stay usable', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !message.text().startsWith('Failed to load resource: net::ERR_')
    ) {
      runtimeErrors.push(message.text());
    }
  });

  for (const viewport of [
    { width: 768, height: 1024, name: 'tablet-768x1024' },
    { width: 844, height: 390, name: 'landscape-844x390' },
    { width: 1440, height: 900, name: 'desktop-1440x900' },
  ]) {
    await page.setViewportSize(viewport);
    await startBlank(page);
    await expect(
      page.getByRole('button', { name: '打开页面导航' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: '点击在当前位置添加星星，或拖到地图上放置',
      }),
    ).toBeVisible();
    await page.waitForTimeout(1_200);
  }

  // A 768 × 1024 display at 200% browser zoom has an effective
  // layout viewport of approximately 384 × 512 CSS pixels.
  await page.setViewportSize({ width: 384, height: 512 });
  await startBlank(page);
  await expect(
    page.getByRole('button', { name: '打开页面导航' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /打开星星信箱/ }),
  ).toBeVisible();
  await page.waitForTimeout(1_200);
  expect(runtimeErrors).toEqual([]);
});
