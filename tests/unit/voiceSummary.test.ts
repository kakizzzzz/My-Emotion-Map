import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestMicrophoneAccess } from '../../src/features/notes/speechRecognition';
import { requestVoiceSummary } from '../../src/services/voiceSummary';

const auth = {
  supabaseUrl: 'https://example.supabase.co',
  publishableKey: 'publishable-key',
  accessToken: 'access-token',
  userId: 'user-1',
};

const originalMediaDevices = Object.getOwnPropertyDescriptor(
  navigator,
  'mediaDevices',
);

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalMediaDevices) {
    Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  } else {
    Reflect.deleteProperty(navigator, 'mediaDevices');
  }
});

describe('voice input pipeline', () => {
  it('requests microphone access and immediately releases the permission stream', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop }],
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    await expect(requestMicrophoneAccess()).resolves.toBe('granted');
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('reports denied microphone permission without starting recognition', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(
          new DOMException('Denied', 'NotAllowedError'),
        ),
      },
    });

    await expect(requestMicrophoneAccess()).resolves.toBe('denied');
  });

  it('reports unavailable when the preview browser exposes no media devices', async () => {
    Reflect.deleteProperty(navigator, 'mediaDevices');
    await expect(requestMicrophoneAccess()).resolves.toBe('unavailable');
  });

  it('sends the spoken transcript to the authenticated summary endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'ready',
      result: { summary: '我在公园散步，感觉很放松。', placeRating: 'comfortable' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestVoiceSummary({
      auth,
      transcript: '我刚才在公园里面走了很久，然后觉得挺放松的。',
      language: 'zh',
      target: 'answer',
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      summary: '我在公园散步，感觉很放松。',
      placeRating: 'comfortable',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/voice-summary',
      expect.objectContaining({ method: 'POST' }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      language: 'zh',
      target: 'answer',
    });
  });
});
