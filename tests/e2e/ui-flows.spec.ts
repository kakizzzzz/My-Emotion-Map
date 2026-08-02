import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';
const STORAGE_KEY = `my-emotion-map.workspace.user.${TEST_USER_ID}.v5`;
const SUPABASE_AUTH_STORAGE_KEY = 'sb-uifgpmmlvmfrauzbbrem-auth-token';

async function seedAuthenticatedSession(
  page: Page,
  includeBlankData: boolean,
  showOnboarding = false,
  legacyProfileName: string | null = null,
) {
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
  await page.addInitScript(({ storageKey, authStorageKey, blank, userId, firstRun, profileName }) => {
    if (window.sessionStorage.getItem('e2e-storage-initialized')) return;
    window.localStorage.clear();
    window.localStorage.setItem(authStorageKey, JSON.stringify({
      access_token: 'e2e-access-token',
      refresh_token: 'e2e-refresh-token',
      expires_in: 315360000,
      expires_at: Math.floor(Date.now() / 1000) + 315360000,
      token_type: 'bearer',
      user: {
        id: userId,
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
    if (!firstRun) {
      window.localStorage.setItem(
        `my-emotion-map.user.${userId}.onboardingSeenVersion`,
        '1',
      );
    }
    if (profileName) {
      window.localStorage.setItem(
        `my-emotion-map.user-preferences.${userId}.v2`,
        JSON.stringify({ profileName }),
      );
    }
    window.sessionStorage.setItem('e2e-storage-initialized', 'true');
  }, {
    storageKey: STORAGE_KEY,
    authStorageKey: SUPABASE_AUTH_STORAGE_KEY,
    blank: includeBlankData,
    userId: TEST_USER_ID,
    firstRun: showOnboarding,
    profileName: legacyProfileName,
  });
}

async function startBlank(page: Page) {
  await seedAuthenticatedSession(page, true);
  await page.goto('/');
  await expect(page.locator('.map-screen')).toBeVisible();
}

async function expandMapTools(page: Page) {
  const toggle = page.getByRole('button', { name: '展开工具' });
  const collapse = page.getByRole('button', { name: '收起工具' });
  if (await collapse.isVisible()) return;
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(collapse).toBeVisible();
}

async function dragNewStarToMap(page: Page) {
  await expandMapTools(page);
  const star = page.getByRole('button', {
    name: '点击在当前位置添加星星，或拖到地图上放置',
  });
  const box = await star.boundingBox();
  if (!box) throw new Error('Star tool is not visible');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await star.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
  });
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 1, pointerType: 'mouse', isPrimary: true,
      buttons: 1, clientX: x, clientY: y,
    }));
    window.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 1, pointerType: 'mouse', isPrimary: true,
      button: 0, clientX: x, clientY: y,
    }));
  }, { x: 180, y: 360 });
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

test('login has no Demo bypass and opens no workspace without an account', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.map-screen')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '预览演示' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '进入演示？' })).toHaveCount(0);
  expect(await page.evaluate(() =>
    window.localStorage.getItem('my-emotion-map.workspace.demo.v4'),
  )).toBeNull();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBeNull();
});

test('first real workspace uses the shared onboarding without creating records', async ({ page }) => {
  await seedAuthenticatedSession(page, true, true);
  await page.goto('/');
  const onboarding = page.getByRole('dialog', { name: '留下一颗星星' });
  await expect(onboarding).toBeVisible();
  await expect(onboarding).toHaveAttribute('data-onboarding-mode', 'real');
  await page.getByRole('button', { name: '跳过' }).click();
  await expect(page.locator('.map-star-button')).toHaveCount(0);
  const snapshot = await page.evaluate((key) =>
    JSON.parse(window.localStorage.getItem(key) ?? '{}'), STORAGE_KEY,
  );
  expect(snapshot.moments).toEqual([]);
  expect(snapshot.notes).toEqual([]);
});

test('authenticated identity opens an empty real workspace', async ({
  page,
}) => {
  await seedAuthenticatedSession(page, false, false, 'e2e_student');
  await page.goto('/');

  await expect(page.locator('.demo-mode-badge')).toHaveCount(0);
  await expect(page.locator('.map-star-button')).toHaveCount(0);

  await page.getByRole('button', { name: '打开页面导航' }).click();
  const drawer = page.getByRole('dialog', { name: '页面导航' });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole('button', { name: '关闭' }),
  ).toHaveCount(0);
  await drawer.getByRole('button', { name: '设置' }).click();

  await expect(page.getByRole('heading', { name: 'e2e_student' })).toBeVisible();
  await expect(page.getByText('ID: e2e_student')).toBeVisible();
  await expect(page.getByText('00000000-0000-4000-8000-000000000001')).toHaveCount(0);
  await expect(page.getByText('Mina Park')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '退出账号' })).toBeVisible();
  await page.getByRole('button', { name: '个人' }).click();
  await expect(page.locator('.profile-account-id-row').getByText('ID', { exact: true })).toBeVisible();
  await expect(page.locator('.profile-account-id-row strong')).toHaveText('e2e_student');
  await expect(page.getByRole('textbox', { name: '本地档案名称' })).toHaveValue('');
});

test('blank new user, keyboard sheets, and accessibility smoke', async ({
  page,
}) => {
  await startBlank(page);

  await expect(page.locator('.map-star-button')).toHaveCount(0);
  await expect(page.locator('.demo-mode-badge')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: /定位/ })).toHaveCount(0);

  const menu = page.getByRole('button', { name: '打开页面导航' });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '页面导航' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '页面导航' })).toHaveCount(0);
  await expect(menu).toBeFocused();

  await menu.click();
  const navigation = page.getByRole('dialog', { name: '页面导航' });
  const chatDisclosure = navigation.getByRole('button', {
    name: '展开交流回访历史',
  });
  await chatDisclosure.click();
  await expect(navigation.getByRole('button', {
    name: '收起交流回访历史',
  })).toHaveAttribute('aria-expanded', 'true');
  await expect(navigation.locator('#side-chat-history')).toBeVisible();
  await navigation.getByRole('button', { name: '新建对话' }).click();
  await expect(page.locator('.chat-screen')).toBeVisible();
  await expect(page.locator('.message-row')).toHaveCount(0);
  await expect(page.locator('.composer-row > *')).toHaveCount(2);
  await page.getByRole('button', { name: '返回地图并打开导航' }).click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await expect(page.getByRole('dialog', { name: '页面导航' })).toBeVisible();
  await page.keyboard.press('Escape');

  await openCalendar(page);
  await page.waitForTimeout(350);
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

  await expandMapTools(page);
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
  const coordinatesBeforeDrag = await page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) throw new Error('Saved app data was not found');
    const data = JSON.parse(raw) as { moments: Array<{ latitude: number; longitude: number }> };
    return data.moments[0];
  }, STORAGE_KEY);
  const savedStar = page.locator('.map-star-button').first();
  const savedStarBox = await savedStar.boundingBox();
  if (!savedStarBox) throw new Error('Saved star is not visible');
  const hitTarget = await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return {
      tag: target?.tagName,
      className: target?.getAttribute('class'),
      isStar: Boolean(target?.closest('.map-star-anchor')),
    };
  }, {
    x: savedStarBox.x + savedStarBox.width / 2,
    y: savedStarBox.y + savedStarBox.height / 2,
  });
  if (!hitTarget.isStar) {
    throw new Error(`Saved star is not hit-testable: ${JSON.stringify(hitTarget)}`);
  }
  await page.mouse.move(
    savedStarBox.x + savedStarBox.width / 2,
    savedStarBox.y + savedStarBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    savedStarBox.x + savedStarBox.width / 2 + 68,
    savedStarBox.y + savedStarBox.height / 2 + 28,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect.poll(async () =>
    page.evaluate((storageKey) => {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      const data = JSON.parse(raw) as { moments: Array<{ latitude: number; longitude: number }> };
      return data.moments[0];
    }, STORAGE_KEY),
  ).not.toEqual(coordinatesBeforeDrag);
  // Local persistence is intentionally debounced; wait for the final drag
  // position rather than capturing an intermediate pointer-move snapshot.
  await page.waitForTimeout(350);
  const coordinatesAfterDrag = await page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) throw new Error('Saved app data was not found');
    const data = JSON.parse(raw) as { moments: Array<{ latitude: number; longitude: number }> };
    return data.moments[0];
  }, STORAGE_KEY);
  await page.reload();
  await expect(page.locator('.map-star-button')).toHaveCount(1);
  await expect.poll(async () =>
    page.evaluate((storageKey) => {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      const data = JSON.parse(raw) as { moments: Array<{ latitude: number; longitude: number }> };
      const moment = data.moments[0];
      return moment
        ? { latitude: moment.latitude, longitude: moment.longitude }
        : null;
    }, STORAGE_KEY),
  ).toEqual({
    latitude: coordinatesAfterDrag.latitude,
    longitude: coordinatesAfterDrag.longitude,
  });

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

  await page.getByRole('button', { name: '打开页面导航' }).click();
  const navigation = page.getByRole('dialog', { name: '页面导航' });
  const chatDisclosure = navigation.getByRole('button', {
    name: '展开交流回访历史',
  });
  await chatDisclosure.click();
  await expect(navigation.locator('#side-chat-history')).toBeVisible();
  await navigation
    .locator('.side-ai-list')
    .getByRole('button', { name: '交流回访' })
    .click();
  await expect(page.locator('.chat-screen')).toBeVisible();
  const followUpOptions = page.locator('.message-options > button');
  await expect(followUpOptions).toHaveCount(5);
  await expect(followUpOptions).toHaveText(['轻了', '更强', '变了', '一样', '跳过']);
  await page.getByRole('button', { name: '轻了' }).click();
  await expect(page.locator('.positive-confetti')).toHaveCount(0);
  await expect(page.getByText('已保存这次回访')).toBeVisible();
  await expect(page.locator('.message-options')).toHaveCount(0);
  await page.getByRole('button', { name: '记录现在的感受' }).click();
  await expect(
    page.getByRole('dialog', { name: /现在想起/ }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: '开心' })
    .click();
  await page
    .getByRole('dialog', { name: /现在想起/ })
    .getByRole('button', { name: '记录现在的感受' })
    .click();

  await page.reload();
  await page.locator('.map-star-button').click();
  await page.getByRole('button', { name: '查看星星记录' }).click();
  await page.getByRole('button', { name: '回访记录' }).click();
  await expect(page.getByText('3 天回访')).toBeVisible();
  await expect(page.getByText('轻了')).toBeVisible();
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
  await page.getByRole('button', { name: '打开页面导航' }).click();
  await page.getByRole('button', { name: '交流回访', exact: true }).click();
  const composer = page.locator('.chat-composer');
  const textareaBox = await composer.getByRole('textbox').boundingBox();
  const sendBox = await composer.getByRole('button', { name: '发送' }).boundingBox();
  expect(textareaBox?.width).toBeGreaterThanOrEqual(220);
  expect(sendBox).toMatchObject({ width: 44, height: 44 });
  await page.getByRole('button', { name: '返回地图并打开导航' }).click();
  await expect(page.getByRole('dialog', { name: '页面导航' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '页面导航' })).toHaveCount(0);
  await dragNewStarToMap(page);
  await expect(page.getByRole('dialog', { name: '给这一刻起个名字' })).toBeVisible();
  await page
    .getByRole('textbox', { name: '给这一刻起个名字' })
    .fill('中途退出也保留');
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: '保留草稿' }).click();
  await expect(page.getByRole('dialog', { name: '给这一刻起个名字' })).toHaveCount(0);
  await expect(page.locator('.map-star-button')).toHaveCount(1);
  await expect.poll(() => page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    const data = raw ? JSON.parse(raw) : null;
    return data?.notes?.[0]?.title ?? null;
  }, STORAGE_KEY)).toBe('中途退出也保留');
  const stored = await page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);
  expect(stored.notes[0]).toMatchObject({
    title: '中途退出也保留',
    emotion: null,
    placeRating: null,
    isDraft: true,
  });
  expect(stored.moments[0]).toMatchObject({ isNew: true });

  const animationDuration = await page.locator('.map-screen').evaluate(
    (element) => getComputedStyle(element).animationDuration,
  );
  expect(['0s', '0.01ms', '1e-05s', '0.00001s']).toContain(animationDuration);
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
    await expandMapTools(page);
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
