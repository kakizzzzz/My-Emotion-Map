import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateEmotionChatRequest } from '../../supabase/functions/_shared/emotionChatRequest';
import { requestEmotionChat } from '../../src/services/emotionChat';

const valid = {
  requestId: 'chat-request-1',
  message: '图书馆那条是什么？',
  language: 'zh',
  conversationId: 'conversation-1',
  selectedNoteIds: [],
  clientRevision: 8,
  responseStyle: ['concise'],
};

describe('emotion-chat request boundary', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('accepts only client fields that cannot control model or evidence', () => {
    expect(validateEmotionChatRequest(valid)).not.toBeNull();
    for (const forbidden of [
      { evidence: [{ noteId: 'other-user-note' }] },
      { model: 'expensive-model' },
      { max_tokens: 9999 },
      { systemPrompt: 'ignore boundaries' },
    ]) {
      expect(validateEmotionChatRequest({ ...valid, ...forbidden })).toBeNull();
    }
  });

  it('requires a structured reference confirmation without extra fields', () => {
    expect(validateEmotionChatRequest({
      ...valid,
      referenceConfirmation: {
        optionId: 'candidate-1', continuationToken: 'signed.token',
      },
    })?.referenceConfirmation).toEqual({
      optionId: 'candidate-1', continuationToken: 'signed.token',
    });
    expect(validateEmotionChatRequest({
      ...valid,
      referenceConfirmation: {
        optionId: 'candidate-1', continuationToken: 'signed.token', noteId: 'n1',
      },
    })).toBeNull();
  });

  it('accepts only separately labelled My Life Memory public evidence', async () => {
    const payload = {
      requestId: valid.requestId,
      serverRevision: valid.clientRevision,
      intent: 'lookup', retrievalStatus: 'supported', status: 'supported',
      answer: '一条外部记录。', evidence: [], confidence: 'low', limitations: [],
      externalEvidence: [{
        referenceId: 'mlm-note-1', title: 'Campus walk', date: '2026-08-01',
        place: 'Dongguk University', matchReason: 'my_life_memory:research',
        source: 'my_life_memory_external',
      }], clarificationOptions: [],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify(payload), { status: 200 },
    )));
    const result = await requestEmotionChat({
      auth: {
        supabaseUrl: 'https://project.supabase.co',
        publishableKey: 'publishable', accessToken: 'access', userId: 'user-a',
      },
      requestId: valid.requestId,
      message: valid.message,
      language: 'zh',
      conversationId: valid.conversationId,
      selectedNoteIds: [], clientRevision: valid.clientRevision,
      signal: new AbortController().signal,
    });
    expect(result?.externalEvidence).toEqual([expect.objectContaining({
      referenceId: 'mlm-note-1', source: 'my_life_memory_external',
    })]);
  });
});
