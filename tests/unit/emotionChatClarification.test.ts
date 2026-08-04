import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestEmotionChat } from '../../src/services/emotionChat';

const auth = {
  supabaseUrl: 'https://example.supabase.co',
  publishableKey: 'public-test-key',
  accessToken: 'user-access-token',
  userId: 'user-one',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('emotion chat clarification responses', () => {
  it('keeps a signed continuation token up to the server contract limit', async () => {
    const continuationToken = 't'.repeat(3_500);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      requestId: 'request-long-token',
      serverRevision: 7,
      intent: 'clarification_required',
      retrievalStatus: 'clarification_required',
      status: 'clarification_required',
      answer: '请选择一条记录。',
      evidence: [],
      externalEvidence: [],
      mcpCalls: [],
      confidence: 'none',
      limitations: [],
      clarificationOptions: [{
        optionId: 'candidate-one',
        label: '图书馆',
        continuationToken,
      }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));

    const result = await requestEmotionChat({
      auth,
      requestId: 'request-long-token',
      message: '图书馆那条是什么？',
      language: 'zh',
      conversationId: 'conversation-one',
      conversationAnchorNoteIds: [],
      clientRevision: 7,
      signal: new AbortController().signal,
    });

    expect(result.clarificationOptions?.[0].continuationToken).toBe(
      continuationToken,
    );
  });
});
