import { expect, test, type Page } from '@playwright/test';

test.skip(
  process.env.RUN_REAL_ACCOUNT_E2E !== '1',
  'Set RUN_REAL_ACCOUNT_E2E=1 to create and verify a real Supabase account.',
);

const APP_ENTRY = process.env.PLAYWRIGHT_BASE_URL ? './' : '/';

const expectWorkspace = async (page: Page, operation: string) => {
  const workspace = page.locator('.map-screen');
  const authFailure = page.locator('.login-auth-error');
  await expect(workspace.or(authFailure)).toBeVisible({ timeout: 30_000 });
  if (await authFailure.isVisible()) {
    throw new Error(`${operation} failed: ${await authFailure.textContent()}`);
  }
  await expect(workspace).toBeVisible();
};

const readSignedInUserId = (page: Page) => page.evaluate(() => {
  for (const key of Object.keys(window.localStorage)) {
    if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const stored = JSON.parse(raw) as {
        user?: { id?: unknown };
        currentSession?: { user?: { id?: unknown } };
      };
      const id = stored.user?.id ?? stored.currentSession?.user?.id;
      if (typeof id === 'string') return id;
    } catch {
      // Ignore unrelated local-storage entries.
    }
  }
  return null;
});

const closeEntryLocationPrompt = async (page: Page) => {
  const prompt = page.getByRole('dialog', { name: '使用定位？' });
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: '暂不' }).click();
};

const register = async (
  page: Page,
  account: string,
  password: string,
) => {
  await page.goto(APP_ENTRY);
  await page.getByRole('button', { name: '注册' }).click();
  await page.getByLabel('账号').fill(account);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('再次输入密码').fill(password);
  await page.getByRole('button', { name: '注册' }).click();
  await expectWorkspace(page, 'Real registration');
  await closeEntryLocationPrompt(page);
};

const login = async (
  page: Page,
  account: string,
  password: string,
) => {
  await page.getByLabel('账号').fill(account);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expectWorkspace(page, 'Real login');
  await closeEntryLocationPrompt(page);
};

const openSettings = async (page: Page) => {
  await page.getByRole('button', { name: '打开页面导航' }).click();
  await page.getByRole('dialog', { name: '页面导航' })
    .getByRole('button', { name: '设置' })
    .click();
  await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible();
};

const dragStarOntoMap = async (page: Page) => {
  const expand = page.getByRole('button', { name: '展开工具' });
  if (await expand.isVisible()) await expand.click();
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
  await page.evaluate(() => {
    for (const type of ['pointermove', 'pointerup'] as const) {
      window.dispatchEvent(new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: type === 'pointermove' ? 1 : 0,
        clientX: 180,
        clientY: 360,
      }));
    }
  });
  await expect(page.locator('.map-star-button')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: '给这一刻起个名字' }))
    .toHaveCount(0);
};

test('real account keeps identity, cloud star, and updated password', async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36);
  const account = `e2e_${suffix}`;
  const initialPassword = `Map!Start9_${suffix}`;
  const updatedPassword = `Map!Next8_${suffix}`;
  const title = `闭环星星 ${suffix}`;

  await register(page, account, initialPassword);
  const initialUserId = await readSignedInUserId(page);
  expect(initialUserId).toMatch(/^[0-9a-f-]{36}$/);

  await expect.poll(() => page.evaluate((userId) => (
    Number(window.localStorage.getItem(`my-emotion-map.cloud-revision.${userId}`) ?? 0)
  ), initialUserId), { timeout: 30_000 }).toBeGreaterThan(0);
  const initialRevision = await page.evaluate((userId) => (
    Number(window.localStorage.getItem(`my-emotion-map.cloud-revision.${userId}`) ?? 0)
  ), initialUserId);

  await dragStarOntoMap(page);
  await page.locator('.map-star-button').click();
  await page.getByRole('button', { name: '记录这颗星星' }).click();
  await page.getByRole('textbox', { name: '给这一刻起个名字' }).fill(title);
  await page.getByRole('button', { name: '平静' }).click();
  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '保存' }).click();

  await expect(page.locator('.map-star-button')).toHaveCount(1);
  await expect.poll(() => page.evaluate((userId) => (
    Number(window.localStorage.getItem(`my-emotion-map.cloud-revision.${userId}`) ?? 0)
  ), initialUserId), { timeout: 30_000 }).toBeGreaterThan(initialRevision);

  await openSettings(page);
  await page.getByRole('button', { name: '退出账号' }).click();
  await expect(page.getByRole('heading', { name: 'My Emotion Map' })).toBeVisible();
  await login(page, account, initialPassword);
  expect(await readSignedInUserId(page)).toBe(initialUserId);
  await expect(page.locator('.map-star-button')).toHaveCount(1);

  await openSettings(page);
  await page.getByRole('button', { name: '修改信息' }).click();
  await page.getByRole('button', { name: '修改密码' }).click();
  await page.getByLabel('新密码').fill(updatedPassword);
  await page.getByLabel('再次输入密码').fill(updatedPassword);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('密码已更新')).toBeVisible();
  await page.getByRole('button', { name: '返回' }).click();
  await page.getByRole('button', { name: '退出账号' }).click();

  const cleanContext = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 390, height: 844 },
  });
  try {
    const cleanPage = await cleanContext.newPage();
    await cleanPage.goto(page.url());
    await login(cleanPage, account, updatedPassword);
    expect(await readSignedInUserId(cleanPage)).toBe(initialUserId);
    await expect(cleanPage.locator('.map-star-button')).toHaveCount(1, {
      timeout: 30_000,
    });
  } finally {
    await cleanContext.close();
  }
});
