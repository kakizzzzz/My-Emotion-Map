import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadNormalizedEmotionReadContext,
  type NormalizedEmotionAccess,
} from '../../supabase/functions/_shared/normalizedEmotionRepository';

const access: NormalizedEmotionAccess = {
  supabaseUrl: 'https://emotion-map.supabase.co',
  userId: 'account-a',
  authorization: 'Bearer server-only',
  apiKey: 'server-only',
};

afterEach(() => vi.unstubAllGlobals());

describe('Emotion Map normalized owner boundary', () => {
  it('queries only the token owner and rejects a mismatched entity row', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        user_id: 'account-a',
        dataset_revision: 4,
        data_model_version: 2,
        migration_verified_at: '2026-08-04T00:00:00.000Z',
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        user_id: 'account-b',
        moment_id: 'other-record',
      }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadNormalizedEmotionReadContext(access)).resolves.toBeNull();
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toHaveLength(2);
    expect(urls.every((url) => url.includes('user_id=eq.account-a'))).toBe(true);
    expect(urls.join('\n')).not.toContain('account-b');
  });
});
