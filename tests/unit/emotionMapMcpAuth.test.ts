import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadOwnerAppState } from '../../supabase/functions/_shared/emotionMapMcpAuth';

const token = {
  id: 'token-a', userId: 'account-a', kind: 'output' as const,
  scopes: ['records:read'],
};
const config = {
  supabaseUrl: 'https://emotion-map.supabase.co',
  serviceRoleKey: 'server-only',
};

afterEach(() => vi.unstubAllGlobals());

describe('Emotion Map MCP owner state boundary', () => {
  it('queries only the token owner and rejects a mismatched row', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      user_id: 'account-b', revision: 4, payload: { dataMode: 'real' },
    }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadOwnerAppState(token, config)).resolves.toBeNull();
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('user_id=eq.account-a');
    expect(url).not.toContain('account-b');
  });
});
