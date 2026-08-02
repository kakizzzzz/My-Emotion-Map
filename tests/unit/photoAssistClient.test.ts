import { afterEach, describe, expect, it, vi } from 'vitest';
import { invokePhotoAssist } from '../../src/features/map/photoAssist';

const auth = {
  supabaseUrl: 'https://project.supabase.co',
  publishableKey: 'publishable-test',
  accessToken: 'session-test',
  userId: 'user-1',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('photo assist client delivery', () => {
  it('returns a validated ready result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'ready',
      result: {
        titleSuggestion: '图书馆窗边的桌子',
        optionalQuestions: ['画面中似乎是学习空间，也可能是其他地方吗？'],
      },
    }), { status: 200 })));

    await expect(invokePhotoAssist({
      auth,
      imageDataUrl: 'data:image/jpeg;base64,test',
      language: 'zh',
    })).resolves.toEqual({
      status: 'ready',
      result: {
        titleSuggestion: '图书馆窗边的桌子',
        optionalQuestions: ['画面中似乎是学习空间，也可能是其他地方吗？'],
      },
    });
  });

  it('keeps retryable and unavailable states explicit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'retryable',
      code: 'rate_limited',
    }), { status: 429 })));

    await expect(invokePhotoAssist({
      auth,
      imageDataUrl: 'data:image/jpeg;base64,test',
      language: 'zh',
    })).resolves.toEqual({ status: 'retryable', code: 'rate_limited' });
  });

  it('rejects malformed success payloads without fabricating success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'ready',
      result: { titleSuggestion: '场景', optionalQuestions: ['1', '2', '3'] },
    }), { status: 200 })));

    await expect(invokePhotoAssist({
      auth,
      imageDataUrl: 'data:image/jpeg;base64,test',
      language: 'zh',
    })).resolves.toEqual({ status: 'retryable', code: 'invalid_result' });
  });
});
