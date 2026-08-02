import { afterEach, describe, expect, it, vi } from 'vitest';
import { retrieveMyLifeMemory } from '../../supabase/functions/_shared/mlmExternalRetrieval';

const plan = {
  source: 'my_life_memory' as const,
  tools: ['research_memory_context' as const],
  maxCalls: 1,
};

const input = {
  supabaseUrl: 'https://emotion-map.supabase.co',
  serviceRoleKey: 'service-role-server-only',
  credentialKey: btoa('k'.repeat(32)),
  endpoint: 'https://my-life-memory.supabase.co/functions/v1/mcp',
  expectedManifestHash: 'a'.repeat(64),
  userId: 'account-a',
  query: '查看 My Life Memory 的校园记录',
  plan,
};

afterEach(() => vi.unstubAllGlobals());

describe('My Life Memory external retrieval boundary', () => {
  it('queries only the authenticated owner connection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await retrieveMyLifeMemory(input);

    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain('user_id=eq.account-a');
    expect(requestUrl).not.toContain('account-b');
    expect(result).toMatchObject({
      status: 'unavailable',
      limitation: 'my_life_memory_not_connected',
    });
  });

  it('turns an invalid owner-connection response into a safe fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));

    await expect(retrieveMyLifeMemory(input)).resolves.toEqual({
      status: 'unavailable',
      evidence: [],
      modelContexts: [],
      limitation: 'my_life_memory_unavailable',
    });
  });
});
