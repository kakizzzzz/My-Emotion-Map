import { describe, expect, it } from 'vitest';
import { validateEmotionChatRequest } from '../../supabase/functions/_shared/emotionChatRequest';

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
});
