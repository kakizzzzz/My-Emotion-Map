import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';
const STORAGE_KEY = `my-emotion-map.workspace.user.${TEST_USER_ID}.v5`;
const SUPABASE_AUTH_STORAGE_KEY = 'sb-uifgpmmlvmfrauzbbrem-auth-token';

async function seedAuthenticatedSession(
  page: Page,
  includeBlankData: boolean,
  legacyProfileName: string | null = null,
  initialConversations: Array<Record<string, unknown>> = [],
) {
  await page.route(
    'https://uifgpmmlvmfrauzbbrem.supabase.co/rest/v1/**',
    async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/rpc/apply_emotion_mutations')) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'e2e_offline', message: 'E2E keeps the local outbox.' }),
        });
        return;
      }
      const body = url.pathname.endsWith('/emotion_settings')
        ? [{
            user_id: TEST_USER_ID,
            dataset_revision: 0,
            changed_revision: 0,
            data_model_version: 2,
            migration_verified_at: '2026-08-04T00:00:00.000Z',
            migration_verification: { verified: true },
            theme_tone: 'original',
            theme_palette: {
              page: '#F3F3F3', card: '#D9D9D9',
              icon: '#C3C3C3', dark: '#5C5C5C',
            },
          }]
        : url.pathname.endsWith('/emotion_preferences')
          ? [{
              user_id: TEST_USER_ID,
              profile_name: legacyProfileName ?? '',
              about_me: '',
              ai_user_prompt: '',
              ai_context_message_count: 8,
              chat_preference_tags: [],
              follow_up_intervals: [3, 7, 14],
              changed_revision: 0,
            }]
          : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    },
  );
  await page.addInitScript(({
    storageKey, authStorageKey, blank, userId, profileName, conversations,
  }) => {
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
        conversations,
        followUps: [],
        revisits: [],
      }));
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
    profileName: legacyProfileName,
    conversations: initialConversations,
  });
}

async function startBlank(page: Page) {
  await seedAuthenticatedSession(page, true);
  await page.goto('/');
  await expect(page.locator('.map-screen')).toBeVisible();
  const locationPrompt = page.getByRole('dialog', { name: '使用定位？' });
  await expect(locationPrompt).toBeVisible();
  await locationPrompt.getByRole('button', { name: '暂不' }).click();
}

async function expandMapTools(page: Page) {
  const toggle = page.getByRole('button', { name: '展开工具' });
  const collapse = page.getByRole('button', { name: '收起工具' });
  if (await collapse.isVisible()) return;
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(collapse).toBeVisible();
}

async function dragNewStarToMap(
  page: Page,
  target = { x: 180, y: 360 },
  expectedCount = 1,
) {
  await expandMapTools(page);
  const star = page.getByRole('button', {
    name: '点击在当前位置添加星星，或拖到地图上放置',
  });
  // Playwright waits for the animated toolbar button to become stable before
  // positioning the real pointer. Reading a bounding box directly can capture
  // an intermediate spring-animation position on slower CI machines.
  await star.hover();
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole('dialog', { name: '给这一刻起个名字' })).toHaveCount(0);
  await expect(page.locator('.map-star-button')).toHaveCount(expectedCount);
}

async function dispatchTouchDrag(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...start, id: 1, radiusX: 6, radiusY: 6, force: 1 }],
  });
  for (let step = 1; step <= 8; step += 1) {
    const progress = step / 8;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
        id: 1,
        radiusX: 6,
        radiusY: 6,
        force: 1,
      }],
    });
  }
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await session.detach();
}

async function dispatchTouchTap(
  page: Page,
  point: { x: number; y: number },
) {
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...point, id: 1, radiusX: 6, radiusY: 6, force: 1 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await session.detach();
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

test('first real workspace asks for location immediately without creating records', async ({ page }) => {
  await seedAuthenticatedSession(page, true);
  await page.goto('/');
  const locationPrompt = page.getByRole('dialog', { name: '使用定位？' });
  await expect(locationPrompt).toBeVisible();
  await expect(locationPrompt.getByRole('button', { name: '关闭' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '留下一颗星星' })).toHaveCount(0);
  await expect(page.locator('.map-star-button')).toHaveCount(0);
  const snapshot = await page.evaluate((key) =>
    JSON.parse(window.localStorage.getItem(key) ?? '{}'), STORAGE_KEY,
  );
  expect(snapshot.moments).toEqual([]);
  expect(snapshot.notes).toEqual([]);
});

test('adding at the current location creates the star without opening the editor', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.558, longitude: 127 });
  await seedAuthenticatedSession(page, true);
  await page.goto('/');
  await page.getByRole('dialog', { name: '使用定位？' })
    .getByRole('button', { name: '允许' }).click();
  await expandMapTools(page);
  await page.getByRole('button', {
    name: '点击在当前位置添加星星，或拖到地图上放置',
  }).click();

  await expect(page.locator('.map-star-button')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: '给这一刻起个名字' })).toHaveCount(0);
  await expect.poll(() => page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    return snapshot.moments?.[0]
      ? [snapshot.moments[0].latitude, snapshot.moments[0].longitude]
      : null;
  }, STORAGE_KEY)).toEqual([37.558, 127]);
});

test('touch can drag a saved star and a later tap still selects it', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'CDP touch input is Chromium-only.');
  await startBlank(page);
  await dragNewStarToMap(page);

  await expect.poll(() => page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    return snapshot.moments?.length ?? 0;
  }, STORAGE_KEY)).toBe(1);
  const coordinatesBeforeDrag = await page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    return {
      latitude: snapshot.moments[0].latitude,
      longitude: snapshot.moments[0].longitude,
    };
  }, STORAGE_KEY);
  expect(coordinatesBeforeDrag).not.toBeNull();

  const marker = page.locator('.map-star-button').first();
  const box = await marker.boundingBox();
  if (!box) throw new Error('Saved star is not visible');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await dispatchTouchDrag(page, start, { x: start.x + 56, y: start.y + 30 });

  await expect(page.locator('.star-action-overlay')).toHaveCount(0);
  await expect.poll(() => page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    return snapshot.moments?.[0]
      ? {
          latitude: snapshot.moments[0].latitude,
          longitude: snapshot.moments[0].longitude,
        }
      : null;
  }, STORAGE_KEY)).not.toEqual(coordinatesBeforeDrag);

  await page.waitForTimeout(750);
  const movedBox = await marker.boundingBox();
  if (!movedBox) throw new Error('Moved star is not visible');
  const tap = {
    x: movedBox.x + movedBox.width / 2,
    y: movedBox.y + movedBox.height / 2,
  };
  await dispatchTouchTap(page, tap);
  await expect(page.locator('.star-action-overlay')).toBeVisible();
});

test('authenticated identity opens an empty real workspace', async ({
  page,
}) => {
  await seedAuthenticatedSession(page, false, 'e2e_student');
  await page.goto('/');
  await page.getByRole('dialog', { name: '使用定位？' })
    .getByRole('button', { name: '暂不' }).click();

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
  await expect(page.getByText('ID:e2e_student')).toBeVisible();
  await expect(page.getByText('00000000-0000-4000-8000-000000000001')).toHaveCount(0);
  await expect(page.getByText('Mina Park')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '退出账号' })).toBeVisible();
  await page.getByRole('button', { name: '修改信息' }).click();
  await expect(page.locator('.profile-account-id-row')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '用户姓名' })).toHaveValue(
    'e2e_student',
  );
});

test('complete backup, import preview, cancel, and typed workspace deletion are wired', async ({
  page,
}) => {
  await startBlank(page);
  await page.getByRole('button', { name: '打开页面导航' }).click();
  await page.getByRole('dialog', { name: '页面导航' })
    .getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '数据与访问' }).click();
  await page.getByRole('button', { name: '导出数据' }).click();

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '下载完整备份' }).click(),
  ]).then(([value]) => value);
  expect(download.suggestedFilename()).toMatch(/^my-emotion-map-backup-.*\.json$/);
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('Complete backup was not persisted by Playwright.');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入完整备份' }).click();
  await (await chooser).setFiles(downloadPath);
  await expect(page.getByRole('group', { name: '导入预览' })).toBeVisible();
  await expect(page.getByRole('button', { name: '合并', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '替换当前工作区' })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('group', { name: '导入预览' })).toHaveCount(0);

  const deleteButton = page.getByRole('button', { name: '永久删除工作区数据' });
  await expect(deleteButton).toBeDisabled();
  await page.getByRole('textbox', { name: '输入“永久删除”确认' }).fill('永久删除');
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  await expect(page.getByRole('textbox', { name: '输入“永久删除”确认' })).toHaveValue('');
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
  const chatRow = navigation.getByRole('button', { name: '交流回访', exact: true });
  await chatRow.click();
  await expect(chatRow).toHaveAttribute('aria-expanded', 'true');
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

test('add, complete, reopen, revisit, persist, and permanently delete', async ({
  page,
}) => {
  test.setTimeout(75_000);
  await startBlank(page);
  await dragNewStarToMap(page);
  await page.locator('.map-star-button').click();
  await page.getByRole('button', { name: '记录这颗星星' }).click();
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
  await page.getByRole('dialog', { name: '使用定位？' })
    .getByRole('button', { name: '暂不' }).click();
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

  await page.clock.setFixedTime(new Date('2030-08-04T12:00:00.000Z'));
  await page.reload();
  await page.getByRole('dialog', { name: '使用定位？' })
    .getByRole('button', { name: '暂不' }).click();

  await page.getByRole('button', { name: '打开页面导航' }).click();
  const navigation = page.getByRole('dialog', { name: '页面导航' });
  await navigation.getByRole('button', { name: '交流回访', exact: true }).click();
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
  await page.getByRole('dialog', { name: '使用定位？' })
    .getByRole('button', { name: '暂不' }).click();
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
  let deleteDialogShown = false;
  page.once('dialog', async (dialog) => {
    deleteDialogShown = true;
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: '删除星星' }).click();
  expect(deleteDialogShown).toBe(false);
  await expect(page.locator('.map-star-button')).toHaveCount(0);
  await page.reload();
  await page.getByRole('dialog', { name: '使用定位？' })
    .getByRole('button', { name: '暂不' }).click();
  await expect(page.locator('.map-star-button')).toHaveCount(0);
});

test('five-star neurodiversity journey covers choices, skips, revisits, inbox, calendar, history and chat tools', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-mobile',
    'The full five-record journey runs once; shared flows still run in WebKit.',
  );
  test.setTimeout(150_000);
  const chatRequests: Array<Record<string, unknown>> = [];
  await page.route(
    'https://uifgpmmlvmfrauzbbrem.supabase.co/functions/v1/emotion-chat',
    async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      chatRequests.push(body);
      const message = String(body.message ?? '');
      const clientRevision = Number(body.clientRevision ?? 0);
      const requestId = String(body.requestId ?? '');
      const usesMemory = /日本|旅行|記録|记录/.test(message);
      if (body.operation === 'plan') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'planned', requestId, serverRevision: clientRevision,
            source: usesMemory ? 'both' : 'emotion_map_local',
            tools: usesMemory ? ['research_memory_context'] : [],
            maxCalls: usesMemory ? 1 : 0,
            routingPlanToken: `e2e-plan-${requestId}`,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          requestId, serverRevision: clientRevision,
          intent: usesMemory ? 'lookup' : 'casual',
          retrievalStatus: 'supported', status: 'supported',
          answer: usesMemory
            ? '我接上了这段对话，并查过已连接的记忆工具。'
            : `我知道你设备上的今天是 ${
                (body.clientContext as { localDate?: string } | undefined)?.localDate ?? '未知日期'
              }。`,
          evidence: [],
          externalEvidence: usesMemory ? [{
            referenceId: 'external-e2e-1', title: '日本旅行',
            date: '2026-07-01', place: '东京',
            matchReason: 'my_life_memory:research',
            source: 'my_life_memory_external',
          }] : [],
          mcpCalls: usesMemory ? [{
            server: 'my_life_memory',
            toolName: 'research_memory_context', status: 'completed',
          }] : [],
          confidence: usesMemory ? 'medium' : 'none',
          limitations: [], clarificationOptions: [],
        }),
      });
    },
  );

  await startBlank(page);
  const scenarios = [
    { title: '五条测试·平静', emotion: '平静', rating: '很安心', skip: false },
    { title: '五条测试·开心', emotion: '开心', rating: '比较舒服', skip: true },
    { title: '五条测试·低落', emotion: '低落', rating: '没特别感觉', skip: false },
    { title: '五条测试·过载', emotion: '过载', rating: '有点不舒服', skip: true },
    { title: '五条测试·混合', emotion: '混合', rating: '很难受', skip: false },
  ] as const;
  const targets = [
    { x: 92, y: 260 }, { x: 178, y: 286 }, { x: 266, y: 315 },
    { x: 118, y: 410 }, { x: 246, y: 446 },
  ];

  for (const [index, scenario] of scenarios.entries()) {
    await dragNewStarToMap(page, targets[index], index + 1);
    await page.locator('.map-star-button').nth(index).click();
    await page.getByRole('button', { name: '记录这颗星星' }).click();
    await page.getByRole('textbox', { name: '给这一刻起个名字' })
      .fill(scenario.title);
    await page.getByRole('button', { name: scenario.emotion }).click();
    await page.getByTitle(scenario.rating).click();
    await page.getByRole('button', { name: '愿意不定期后续回访' }).click();
    await page.getByRole('button', { name: '继续到引导问题' }).click();
    if (scenario.skip) {
      await page.getByRole('button', { name: '跳过问答' }).click();
    } else {
      for (const [questionIndex, [question, answer]] of [
        ['你去这做什么？', `${scenario.title}的来访目的。`],
        ['这里有什么让你注意到的？', `${scenario.title}里最明显的感受。`],
        ['你想为以后留下什么？', `${scenario.title}以后可以回看。`],
      ].entries()) {
        await page.getByRole('textbox', { name: question }).fill(answer);
        await page.getByRole('button', {
          name: questionIndex === 2 ? '完成引导问题' : '下一题',
        }).click();
      }
    }
    await page.getByRole('button', { name: '点击保存' }).click();
    await expect(page.getByText('这颗星星已经记下来了')).toBeVisible();
    await page.locator('.maplibregl-canvas').click({ position: { x: 36, y: 150 } });
  }

  await expect(page.locator('.map-star-button')).toHaveCount(5);
  await expect.poll(() => page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    return {
      emotions: snapshot.notes.map((note: { emotion: string | null }) => note.emotion),
      drafts: snapshot.notes.filter((note: { isDraft?: boolean }) => note.isDraft).length,
      followUps: snapshot.followUps.length,
      answeredQuestions: snapshot.notes.map(
        (note: { answers: Array<{ answer: string }> }) =>
          note.answers.filter((answer) => answer.answer.trim()).length,
      ),
    };
  }, STORAGE_KEY)).toEqual({
    emotions: ['calm', 'joy', 'heavy', 'overwhelmed', 'mixed'],
    drafts: 0,
    followUps: 15,
    answeredQuestions: [3, 0, 3, 0, 3],
  });

  await openCalendar(page);
  await page.getByRole('button', { name: /5条记录/ }).first().click();
  for (const scenario of scenarios) {
    await expect(page.getByRole('button', { name: new RegExp(scenario.title) }))
      .toBeVisible();
  }
  await page.getByRole('dialog', { name: '记录日历' })
    .getByRole('button', { name: '关闭' }).click();

  await page.clock.setFixedTime(new Date('2030-08-04T12:34:00.000Z'));
  await page.reload();
  await page.getByRole('dialog', { name: '使用定位？' })
    .getByRole('button', { name: '暂不' }).click();
  await page.getByRole('button', { name: '打开页面导航' }).click();
  const navigation = page.getByRole('dialog', { name: '页面导航' });
  await navigation.getByRole('button', { name: '交流回访', exact: true }).click();
  await navigation.locator('.side-ai-list')
    .getByRole('button', { name: '交流回访' }).click();
  await expect(page.locator('.message-options > button')).toHaveCount(5);
  await page.getByRole('button', { name: '轻了' }).click();
  await expect(page.getByText('已保存这次回访')).toBeVisible();

  const composer = page.locator('.chat-composer');
  await composer.getByRole('textbox').fill('今天是几号？');
  await composer.getByRole('button', { name: '发送' }).click();
  await expect(page.getByText(/我知道你设备上的今天是/)).toBeVisible();
  await composer.getByRole('textbox').fill('接着聊，并看看我以前的日本旅行记录');
  await composer.getByRole('button', { name: '发送' }).click();
  await expect(page.getByText('My Life Memory MCP · 调用完成')).toBeVisible();
  await expect(page.getByText('我接上了这段对话，并查过已连接的记忆工具。'))
    .toBeVisible();

  const chatPayload = chatRequests.find((body) =>
    body.operation === undefined && body.message === '今天是几号？'
  );
  const expectedClock = await page.evaluate(() => {
    const now = new Date();
    const offset = -now.getTimezoneOffset();
    return {
      localDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      localTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      utcOffsetMinutes: Object.is(offset, -0) ? 0 : offset,
    };
  });
  expect(chatPayload?.clientContext).toMatchObject(expectedClock);

  await page.getByRole('button', { name: '返回地图并打开导航' }).click();
  await page.keyboard.press('Escape');
  await page.locator('.global-inbox-button').click();
  await expect(page.getByRole('dialog', { name: '星星信箱' })).toBeVisible();
  await expect(page.locator('.star-inbox-entry')).toHaveCount(14);
  await page.locator('.star-inbox-card').first().click();
  await page.locator('.star-inbox-entry').first()
    .getByRole('button', { name: '跳过' }).click();
  await expect(page.locator('.star-inbox-entry')).toHaveCount(13);
  await page.getByRole('dialog', { name: '星星信箱' })
    .getByRole('button', { name: '关闭' }).click();

  await page.locator('.map-star-button').first().click();
  await page.getByRole('button', { name: '查看星星记录' }).click();
  await page.getByRole('button', { name: '回访记录' }).click();
  await expect(page.getByText(/3 天回访/)).toBeVisible();
  await expect(page.getByText(/轻了|这次已略过/).first()).toBeVisible();
});

test('320px core flow and reduced-motion map behavior', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startBlank(page);
  await page.getByRole('button', { name: '打开页面导航' }).click();
  const navigation = page.getByRole('dialog', { name: '页面导航' });
  await navigation.getByRole('button', { name: '交流回访', exact: true }).click();
  await navigation.getByRole('button', { name: '新建对话' }).click();
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
  await page.locator('.map-star-button').click();
  await page.getByRole('button', { name: '记录这颗星星' }).click();
  await expect(page.getByRole('dialog', { name: '给这一刻起个名字' })).toBeVisible();
  await page
    .getByRole('textbox', { name: '给这一刻起个名字' })
    .fill('中途退出也保留');
  await page.getByRole('button', { name: '平静' }).click();
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: '保存' }).click();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect(page.getByRole('dialog', { name: '给这一刻起个名字' })).toHaveCount(0);
  await expect(page.locator('.map-star-button')).toHaveCount(1);
  await expect(page.locator('.map-star-button .emotion-star__expression')).toHaveCount(1);
  await expect(page.locator('.map-star-button .star-marker-glyph stop').first())
    .toHaveAttribute('stop-color', '#7F9E91');
  expect(await page.evaluate((storageKey) => {
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
    emotion: 'calm',
    placeRating: null,
    isDraft: false,
  });
  expect(stored.moments[0]).toMatchObject({ emotion: 'calm', isNew: false });

  const animationDuration = await page.locator('.map-screen').evaluate(
    (element) => getComputedStyle(element).animationDuration,
  );
  expect(['0s', '0.01ms', '1e-05s', '0.00001s']).toContain(animationDuration);
});

test('regular conversation rows reveal a real delete action on left swipe', async ({ page }) => {
  await seedAuthenticatedSession(page, true, null, [{
      id: 'conversation-delete',
      title: '可删除对话',
      preview: '左滑删除',
      kind: 'regular',
      messages: [],
  }]);
  await page.goto('/');
  await page.getByRole('dialog', { name: '使用定位？' })
    .getByRole('button', { name: '暂不' }).click();
  await page.getByRole('button', { name: '打开页面导航' }).click();
  const navigation = page.getByRole('dialog', { name: '页面导航' });
  await navigation.getByRole('button', { name: '交流回访', exact: true }).click();
  await expect(navigation.locator('#side-chat-history')).toHaveCSS('opacity', '1');
  const row = navigation.locator('.side-ai-thread', { hasText: '可删除对话' });
  await expect(row).toBeVisible();
  const box = await row.boundingBox();
  if (!box) throw new Error('Conversation row is not visible');
  await page.mouse.move(box.x + box.width - 12, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await navigation.getByRole('button', { name: '删除 可删除对话' }).click();
  await expect(row).toHaveCount(0);
  await expect.poll(() => page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    return snapshot.conversations?.length ?? -1;
  }, STORAGE_KEY)).toBe(0);
});

test('an emotionless star changes color immediately', async ({ page }) => {
  await startBlank(page);
  await dragNewStarToMap(page);
  await expect(page.locator('.map-star-button .star-marker-glyph stop').first())
    .toHaveAttribute('stop-color', '#EDC727');
  await page.locator('.map-star-button').click();
  await page.getByRole('button', { name: '选择心情颜色' }).click();
  await page.getByRole('button', { name: '使用颜色 #D2936D' }).click();
  await expect(page.locator('.map-star-button .star-marker-glyph stop').first())
    .toHaveAttribute('stop-color', '#D2936D');
  await expect.poll(() => page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    return [snapshot.moments?.[0]?.color, snapshot.notes?.[0]?.color];
  }, STORAGE_KEY)).toEqual(['#D2936D', '#D2936D']);
  const stored = await page.evaluate((storageKey) => (
    JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')
  ), STORAGE_KEY);
  expect(stored.moments[0]).toMatchObject({
    emotion: null,
    color: '#D2936D',
  });
  expect(stored.notes[0]).toMatchObject({
    emotion: null,
    color: '#D2936D',
  });
});

test('touching stars in connection mode assigns visible order numbers', async ({ page }) => {
  const seededMoments = [
    { id: 'moment-tag-1', noteId: 'note-tag-1', emotion: null, intensity: 0,
      place: 'A', date: '2026-08-03', time: '10:00', longitude: 126.998,
      latitude: 37.558, placeRating: null, isNew: true, source: 'manual' },
    { id: 'moment-tag-2', noteId: 'note-tag-2', emotion: null, intensity: 0,
      place: 'B', date: '2026-08-03', time: '10:01', longitude: 127.002,
      latitude: 37.56, placeRating: null, isNew: true, source: 'manual' },
  ];
  const seededNotes = seededMoments.map((moment) => ({
    id: moment.noteId, title: moment.place, titleSource: 'fallback',
    place: moment.place, date: moment.date, time: moment.time, emotion: null,
    placeRating: null, answers: [], excerpt: '', isDraft: true,
    followUpEnabled: false,
  }));
  await seedAuthenticatedSession(page, true);
  await page.addInitScript(({ storageKey, moments, notes }) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    snapshot.moments = moments;
    snapshot.notes = notes;
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, {
    storageKey: STORAGE_KEY,
    moments: seededMoments,
    notes: seededNotes,
  });
  await page.goto('/');
  await page.getByRole('dialog', { name: '使用定位？' })
    .getByRole('button', { name: '暂不' }).click();
  await expect.poll(() => page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    return snapshot.moments?.map((moment: { id: string }) => moment.id) ?? [];
  }, STORAGE_KEY)).toEqual(['moment-tag-1', 'moment-tag-2']);
  await expect(page.locator('.map-star-button')).toHaveCount(2);
  await expandMapTools(page);
  await page.getByRole('button', { name: '标记并连接星星' }).click();

  for (let index = 0; index < 2; index += 1) {
    await page.locator('.map-star-button').nth(index).evaluate((element, pointerId) => {
      const box = element.getBoundingClientRect();
      const init = {
        pointerId,
        pointerType: 'touch',
        isPrimary: true,
        bubbles: true,
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2,
      };
      element.dispatchEvent(new PointerEvent('pointerdown', init));
      element.dispatchEvent(new PointerEvent('pointerup', init));
    }, index + 1);
  }

  await expect(page.locator('.emotion-star__order')).toHaveText(['1', '2']);
  await expect.poll(() => page.evaluate((storageKey) => {
    const snapshot = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    return snapshot.moments.map((moment: { tagOrder?: number }) => moment.tagOrder);
  }, STORAGE_KEY)).toEqual([1, 2]);

  await page.getByRole('button', { name: '收起标记工具' }).click();
  await page.locator('.map-star-button').last().click();
  await expect(page.locator('.star-navigation-overlay')).toBeVisible();
  await expect(page.locator('.star-action-overlay')).toBeVisible();

  await page.getByRole('button', { name: '标记并连接星星' }).click();
  await expect(page.locator('.star-action-overlay')).toBeVisible();
  await page.locator('.star-navigation-overlay button').nth(1).click();
  await expect(page.locator('.map-star-button').first().locator('.emotion-star'))
    .toHaveClass(/is-selected/);
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
  await page.waitForTimeout(1_200);
  expect(runtimeErrors).toEqual([]);
});
