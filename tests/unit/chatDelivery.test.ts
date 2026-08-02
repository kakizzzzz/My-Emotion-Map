import { describe, expect, it } from 'vitest';
import {
  completeChatRequest,
  failChatRequest,
  submitChatRequest,
} from '../../src/app/chatDelivery';
import type { Conversation } from '../../src/types';

const empty: Conversation[] = [];

describe('canonical chat delivery', () => {
  it('persists the user message immediately and retries with the same requestId', () => {
    const submitted = submitChatRequest(empty, {
      conversationId: 'conversation-1', requestId: 'chat-request-1',
      body: '图书馆那条是什么？', fallbackTitle: '新的对话',
      createdAt: '2026-08-02T12:00:00.000Z',
    });
    expect(submitted[0].messages[0]).toMatchObject({
      requestId: 'chat-request-1', deliveryState: 'pending',
      body: '图书馆那条是什么？',
    });
    const failed = failChatRequest(submitted, 'chat-request-1', 'failed');
    const retry = submitChatRequest(failed, {
      conversationId: 'conversation-1', requestId: 'chat-request-1',
      body: '图书馆那条是什么？', fallbackTitle: '新的对话',
      createdAt: '2026-08-02T12:01:00.000Z',
    });
    expect(retry[0].messages).toHaveLength(1);
    expect(retry[0].messages[0].deliveryState).toBe('pending');
  });

  it('delivers one assistant message even after a duplicate retry response', () => {
    const submitted = submitChatRequest(empty, {
      conversationId: 'conversation-1', requestId: 'chat-request-1',
      body: '问题', fallbackTitle: '新的对话', createdAt: '2026-08-02T12:00:00.000Z',
    });
    const input = {
      conversationId: 'conversation-1', requestId: 'chat-request-1',
      assistantBody: '回答', noteIds: ['note-1'], clarificationOptions: [],
      createdAt: '2026-08-02T12:00:01.000Z',
    };
    const once = completeChatRequest(submitted, input);
    const twice = completeChatRequest(once, { ...input, assistantBody: '重复回答' });
    expect(twice[0].messages).toHaveLength(2);
    expect(twice[0].messages[0].deliveryState).toBe('delivered');
    expect(twice[0].messages[1]).toMatchObject({
      role: 'assistant', replyToRequestId: 'chat-request-1', body: '回答',
    });
  });

  it('stores structured clarification options on the assistant message', () => {
    const submitted = submitChatRequest(empty, {
      conversationId: 'conversation-1', requestId: 'chat-request-1',
      body: '那次是什么？', fallbackTitle: '新的对话', createdAt: '2026-08-02T12:00:00.000Z',
    });
    const completed = completeChatRequest(submitted, {
      conversationId: 'conversation-1', requestId: 'chat-request-1',
      assistantBody: '请选择一条记录。', noteIds: [],
      clarificationOptions: [{
        optionId: 'candidate-1', label: '图书馆 · 2026-08-01',
        continuationToken: 'signed-token',
      }], createdAt: '2026-08-02T12:00:01.000Z',
    });
    expect(completed[0].messages[1]).toMatchObject({
      kind: 'clarification',
      clarificationOptions: [{ optionId: 'candidate-1' }],
    });
  });

  it('stores external evidence separately from local note ids', () => {
    const submitted = submitChatRequest(empty, {
      conversationId: 'conversation-1', requestId: 'chat-request-1',
      body: '结合 My Life Memory 看这周', fallbackTitle: '新的对话',
      createdAt: '2026-08-02T12:00:00.000Z',
    });
    const completed = completeChatRequest(submitted, {
      conversationId: 'conversation-1', requestId: 'chat-request-1',
      assistantBody: '找到一条外部记录。', noteIds: [],
      externalEvidence: [{
        referenceId: 'mlm-note-1', title: 'Campus walk', date: '2026-08-01',
        place: 'Dongguk University', matchReason: 'my_life_memory:research',
        source: 'my_life_memory_external',
      }],
      clarificationOptions: [], createdAt: '2026-08-02T12:00:01.000Z',
    });
    expect(completed[0].messages[1]).toMatchObject({
      noteIds: [],
      externalEvidence: [{
        referenceId: 'mlm-note-1', source: 'my_life_memory_external',
      }],
    });
  });

  it('marks a rejected writing result as retryable without changing retrieval evidence', () => {
    const submitted = submitChatRequest(empty, {
      conversationId: 'conversation-1', requestId: 'chat-request-1',
      body: '问题', fallbackTitle: '新的对话',
      createdAt: '2026-08-02T12:00:00.000Z',
    });
    const completed = completeChatRequest(submitted, {
      conversationId: 'conversation-1', requestId: 'chat-request-1',
      assistantBody: '生成没有通过检查。', noteIds: ['note-1'],
      clarificationOptions: [], retryable: true,
      createdAt: '2026-08-02T12:00:01.000Z',
    });
    expect(completed[0].messages[1]).toMatchObject({
      retryable: true,
      noteIds: ['note-1'],
      replyToRequestId: 'chat-request-1',
    });
  });

  it('does not attach an orphan response to a different request', () => {
    const submitted = submitChatRequest(empty, {
      conversationId: 'conversation-1', requestId: 'chat-request-1',
      body: '问题', fallbackTitle: '新的对话', createdAt: '2026-08-02T12:00:00.000Z',
    });
    const unchanged = completeChatRequest(submitted, {
      conversationId: 'conversation-1', requestId: 'chat-request-other',
      assistantBody: '不应出现', noteIds: [], clarificationOptions: [],
      createdAt: '2026-08-02T12:00:01.000Z',
    });
    expect(unchanged).toEqual(submitted);
  });
});
