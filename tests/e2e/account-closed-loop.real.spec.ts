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
  expectLocationPrompt = true,
) => {
  await page.getByLabel('账号').fill(account);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expectWorkspace(page, 'Real login');
  if (expectLocationPrompt) {
    await closeEntryLocationPrompt(page);
  }
};

const openSettings = async (page: Page) => {
  await page.getByRole('button', { name: '打开页面导航' }).click();
  await page.getByRole('dialog', { name: '页面导航' })
    .getByRole('button', { name: '设置' })
    .click();
  await expect(page.getByRole('dialog', { name: '设置' })).toBeVisible();
};

const verifyRealMcp = async (
  page: Page,
  userId: string,
  title: string,
) => {
  await page.getByRole('button', { name: '数据与访问' }).click();
  await page.getByRole('button', { name: 'My Emotion Map MCP' }).click();
  await page.getByRole('button', { name: '生成 MCP Token' }).click();
  await expect(page.getByText('Token 已生成，请现在复制')).toBeVisible({
    timeout: 30_000,
  });
  const rows = page.locator('.mcp-config-row');
  const endpoint = (await rows.nth(0).locator('span').textContent())?.trim() ?? '';
  const authorization = (await rows.nth(1).locator('span').textContent())?.trim() ?? '';
  expect(endpoint).toMatch(/^https:\/\/[^/]+\/functions\/v1\/emotion-map-mcp$/);
  expect(authorization).toMatch(/^Bearer mem_[a-f0-9]{64}$/);

  const workspaceDate = await page.evaluate(({ id, expectedTitle }) => {
    const raw = window.localStorage.getItem(`my-emotion-map.workspace.user.${id}.v5`);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as {
      notes?: Array<{ date?: unknown; title?: unknown }>;
    };
    const date = snapshot.notes?.find((note) => note.title === expectedTitle)?.date;
    return typeof date === 'string' ? date : null;
  }, { id: userId, expectedTitle: title });
  expect(workspaceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  const headers = {
    authorization,
    accept: 'application/json',
    'content-type': 'application/json',
    'mcp-protocol-version': '2025-06-18',
  };
  const initialize = await page.request.post(endpoint, {
    headers,
    data: {
      jsonrpc: '2.0', id: 'initialize-real', method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {
        name: 'my-emotion-map-e2e', version: '1.0.0',
      } },
    },
  });
  if (!initialize.ok()) {
    throw new Error(`Real MCP initialize failed with HTTP ${initialize.status()}`);
  }
  const initialized = await initialize.json() as {
    result?: { serverInfo?: { name?: string }; protocolVersion?: string };
  };
  expect(initialized.result).toMatchObject({
    protocolVersion: '2025-06-18',
    serverInfo: { name: 'my-emotion-map' },
  });

  const calls = [
    { id: 'list', method: 'tools/list', params: {} },
    { id: 'research', method: 'tools/call', params: {
      name: 'research_emotion_context', arguments: { query: title, limit: 6 },
    } },
    { id: 'search', method: 'tools/call', params: {
      name: 'search_emotion_records', arguments: { query: title, limit: 20 },
    } },
    { id: 'locations', method: 'tools/call', params: {
      name: 'list_emotion_locations', arguments: { limit: 50 },
    } },
    { id: 'location', method: 'tools/call', params: {
      name: 'get_location_emotion_context',
      arguments: { place: '不存在的测试地点', limit: 20 },
    } },
    { id: 'day', method: 'tools/call', params: {
      name: 'get_day_emotion_context', arguments: { date: workspaceDate, limit: 20 },
    } },
    { id: 'summary', method: 'tools/call', params: {
      name: 'summarize_emotion_range', arguments: {
        startDate: workspaceDate, endDate: workspaceDate, groupBy: 'emotion',
      },
    } },
    { id: 'export', method: 'tools/call', params: {
      name: 'export_emotion_report', arguments: {
        startDate: workspaceDate, endDate: workspaceDate, format: 'json', limit: 50,
      },
    } },
  ];
  const batch = await page.request.post(endpoint, { headers, data: calls.map(
    ({ id, method, params }) => ({ jsonrpc: '2.0', id, method, params }),
  ) });
  if (!batch.ok()) {
    throw new Error(`Real MCP tool batch failed with HTTP ${batch.status()}`);
  }
  const results = await batch.json() as Array<{
    id?: string;
    error?: unknown;
    result?: {
      tools?: Array<{ name?: string }>;
      isError?: boolean;
      structuredContent?: { status?: string; count?: number };
    };
  }>;
  expect(results).toHaveLength(calls.length);
  expect(results.every((result) => !result.error)).toBe(true);
  const listed = results.find((result) => result.id === 'list');
  expect(listed?.result?.tools?.map((tool) => tool.name)).toEqual([
    'research_emotion_context',
    'search_emotion_records',
    'list_emotion_locations',
    'get_location_emotion_context',
    'get_day_emotion_context',
    'summarize_emotion_range',
    'export_emotion_report',
  ]);
  for (const result of results.filter((entry) => entry.id !== 'list')) {
    expect(result.result?.isError, result.id).not.toBe(true);
    expect(result.result?.structuredContent?.status, result.id).toBeTruthy();
  }
  for (const id of ['research', 'search', 'day', 'summary', 'export']) {
    const result = results.find((entry) => entry.id === id);
    expect(result?.result?.structuredContent?.status, id)
      .not.toBe('not_found');
  }

  await page.getByRole('button', { name: '返回' }).click();
  await page.getByRole('button', { name: '返回' }).click();
};

const dragStarOntoMap = async (page: Page, expectedCount: number) => {
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
  await expect(page.locator('.map-star-button')).toHaveCount(expectedCount);
  await expect(page.getByRole('dialog', { name: '给这一刻起个名字' }))
    .toHaveCount(0);
};

test('real account keeps identity, cloud star, and updated password', async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36);
  const existingAccount = process.env.REAL_ACCOUNT_ID?.trim();
  const existingPassword = process.env.REAL_ACCOUNT_PASSWORD?.trim();
  const account = existingAccount || `e2e_${suffix}`;
  const initialPassword = existingPassword || `Map!Start9_${suffix}`;
  const updatedPassword = `Map!Next8_${suffix}`;
  const title = `闭环星星 ${suffix}`;

  const initializedSettingsResponse = page.waitForResponse((response) =>
    response.url().includes('/rest/v1/emotion_settings?') &&
    response.request().method() === 'GET' && response.status() === 200,
  );
  const initializedRecordsResponse = page.waitForResponse((response) =>
    response.url().includes('/rest/v1/emotion_records?') &&
    response.request().method() === 'GET' && response.status() === 200,
  );
  if (existingAccount && existingPassword) {
    await page.goto(APP_ENTRY);
    await login(page, account, initialPassword);
  } else {
    await register(page, account, initialPassword);
  }
  const initialUserId = await readSignedInUserId(page);
  expect(initialUserId).toMatch(/^[0-9a-f-]{36}$/);
  const initializedRows = await (await initializedSettingsResponse).json() as Array<{
    user_id?: unknown;
    dataset_revision?: unknown;
    data_model_version?: unknown;
    migration_verified_at?: unknown;
  }>;
  expect(initializedRows[0]).toMatchObject({
    user_id: initialUserId,
    dataset_revision: expect.any(Number),
    data_model_version: 2,
    migration_verified_at: expect.any(String),
  });
  const initialRevision = Number(initializedRows[0]?.dataset_revision);
  expect(Number.isSafeInteger(initialRevision)).toBe(true);
  expect(initialRevision).toBeGreaterThanOrEqual(0);
  const initializedRecords = await (await initializedRecordsResponse).json() as
    Array<{ moment_id?: unknown }>;
  const initialStarCount = initializedRecords.filter(
    (record) => typeof record.moment_id === 'string',
  ).length;
  await expect(page.locator('.map-star-button')).toHaveCount(initialStarCount);

  await dragStarOntoMap(page, initialStarCount + 1);
  await page.locator('.map-star-button').last().click();
  await page.getByRole('button', { name: '记录这颗星星' }).click();
  await page.getByRole('textbox', { name: '给这一刻起个名字' }).fill(title);
  await page.getByRole('button', { name: '平静' }).click();
  await page.getByRole('button', { name: '关闭' }).click();
  const finalRecordResponse = page.waitForResponse(async (response) => {
    if (!response.url().includes('/rest/v1/emotion_records?') ||
      response.request().method() !== 'GET' || response.status() !== 200) {
      return false;
    }
    const rows = await response.json().catch(() => []) as Array<{
      title?: unknown;
      is_draft?: unknown;
    }>;
    return rows.some((record) =>
      record.title === title && record.is_draft === false,
    );
  });
  await page.getByRole('button', { name: '保存' }).click();

  await expect(page.locator('.map-star-button')).toHaveCount(initialStarCount + 1);
  await expect.poll(() => page.evaluate(({ userId, expectedTitle }) => {
    const raw = window.localStorage.getItem(
      `my-emotion-map.workspace.user.${userId}.v5`,
    );
    const snapshot = raw ? JSON.parse(raw) as {
      notes?: Array<{ title?: unknown; isDraft?: unknown }>;
    } : null;
    return snapshot?.notes?.some((note) =>
      note.title === expectedTitle && note.isDraft !== true,
    ) ?? false;
  }, { userId: initialUserId!, expectedTitle: title })).toBe(true);
  const finalRecords = await (await finalRecordResponse).json() as Array<{
    title?: unknown;
    is_draft?: unknown;
    changed_revision?: unknown;
  }>;
  const finalRecord = finalRecords.find((record) => record.title === title);
  expect(finalRecord).toMatchObject({ title, is_draft: false });
  expect(Number(finalRecord?.changed_revision)).toBeGreaterThan(initialRevision);

  await openSettings(page);
  await verifyRealMcp(page, initialUserId!, title);
  await page.getByRole('button', { name: '退出账号' }).click();
  await expect(page.getByRole('heading', { name: 'My Emotion Map' })).toBeVisible();
  await login(page, account, initialPassword, false);
  expect(await readSignedInUserId(page)).toBe(initialUserId);
  await expect(page.locator('.map-star-button')).toHaveCount(initialStarCount + 1);

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
    await expect(cleanPage.locator('.map-star-button')).toHaveCount(initialStarCount + 1, {
      timeout: 30_000,
    });
  } finally {
    await cleanContext.close();
  }
});
