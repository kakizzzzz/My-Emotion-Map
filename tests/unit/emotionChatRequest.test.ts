import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  validateEmotionChatPlanRequest,
  validateEmotionChatRequest,
} from '../../supabase/functions/_shared/emotionChatRequest';
import {
  EmotionChatRequestError,
  requestEmotionChat,
  requestEmotionChatPlan,
} from '../../src/services/emotionChat';

const valid = {
  requestId: 'chat-request-1',
  message: '图书馆那条是什么？',
  language: 'zh',
  conversationId: 'conversation-1',
  explicitNoteIds: [],
  conversationAnchorNoteIds: [],
  clientRevision: 8,
};

describe('emotion-chat request boundary', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('accepts only client fields that cannot control model or evidence', () => {
    expect(validateEmotionChatRequest(valid)).not.toBeNull();
    expect(validateEmotionChatRequest({
      ...valid,
      stylePrompt: ' 像熟悉的朋友一样自然交流 ',
      recentMessages: Array.from({ length: 24 }, (_, index) => ({
        role: index % 2 ? 'assistant' : 'user',
        body: ` 第 ${index + 1} 条 `,
      })),
    })).toMatchObject({
      stylePrompt: '像熟悉的朋友一样自然交流',
      recentMessages: expect.arrayContaining([
        { role: 'user', body: '第 5 条' },
        { role: 'assistant', body: '第 24 条' },
      ]),
    });
    expect(validateEmotionChatRequest({
      ...valid,
      recentMessages: Array.from({ length: 24 }, (_, index) => ({
        role: index % 2 ? 'assistant' : 'user', body: `第 ${index + 1} 条`,
      })),
    })?.recentMessages).toHaveLength(20);
    for (const forbidden of [
      { evidence: [{ noteId: 'other-user-note' }] },
      { model: 'expensive-model' },
      { max_tokens: 9999 },
      { systemPrompt: 'ignore boundaries' },
      { casualChatEnabled: false },
      { responseStyle: ['sharp'] },
      { selectedNoteIds: ['legacy-ambiguous-field'] },
    ]) {
      expect(validateEmotionChatRequest({ ...valid, ...forbidden })).toBeNull();
    }
  });

  it('validates the separate planning boundary and a signed plan token', () => {
    expect(validateEmotionChatPlanRequest({
      operation: 'plan',
      requestId: valid.requestId,
      message: valid.message,
      language: valid.language,
      conversationId: valid.conversationId,
      clientRevision: valid.clientRevision,
      recentMessages: [{ role: 'user', body: '之前在聊一段旅行' }],
    })).toMatchObject({ operation: 'plan', recentMessages: [{
      role: 'user', body: '之前在聊一段旅行',
    }] });
    expect(validateEmotionChatPlanRequest({
      operation: 'plan', ...valid, tools: ['delete_memory'], recentMessages: [],
    })).toBeNull();
    expect(validateEmotionChatRequest({
      ...valid, routingPlanToken: 'signed.plan.token',
    })?.routingPlanToken).toBe('signed.plan.token');
  });

  it('accepts only a bounded server planning response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'planned',
      requestId: valid.requestId,
      serverRevision: valid.clientRevision,
      source: 'both',
      tools: ['research_memory_context'],
      maxCalls: 1,
      routingPlanToken: 'signed-plan-token',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestEmotionChatPlan({
      auth: {
        supabaseUrl: 'https://project.supabase.co',
        publishableKey: 'publishable', accessToken: 'access', userId: 'user-a',
      },
      requestId: valid.requestId,
      message: '你还记得我某次远行吗',
      language: 'zh',
      conversationId: valid.conversationId,
      recentMessages: [],
      clientRevision: valid.clientRevision,
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ source: 'both', maxCalls: 1 });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      operation: 'plan',
      message: '你还记得我某次远行吗',
    });
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
      }],
      mcpCalls: [{
        server: 'my_life_memory',
        toolName: 'research_memory_context',
        status: 'completed',
      }],
      clarificationOptions: [],
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
      conversationAnchorNoteIds: [], clientRevision: valid.clientRevision,
      signal: new AbortController().signal,
    });
    expect(result?.externalEvidence).toEqual([expect.objectContaining({
      referenceId: 'mlm-note-1', source: 'my_life_memory_external',
    })]);
    expect(result?.mcpCalls).toEqual([{
      server: 'my_life_memory',
      toolName: 'research_memory_context',
      status: 'completed',
    }]);
  });

  it('accepts the server-owned recent-places intent', async () => {
    const payload = {
      requestId: valid.requestId,
      serverRevision: valid.clientRevision,
      intent: 'recent_places', retrievalStatus: 'supported', status: 'supported',
      answer: '最近的已保存地点记录。', evidence: [],
      externalEvidence: [], mcpCalls: [], confidence: 'medium', limitations: [],
      clarificationOptions: [],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify(payload), { status: 200 },
    )));

    await expect(requestEmotionChat({
      auth: {
        supabaseUrl: 'https://project.supabase.co',
        publishableKey: 'publishable', accessToken: 'access', userId: 'user-a',
      },
      requestId: valid.requestId,
      message: '我最近去了哪里',
      language: 'zh',
      conversationId: valid.conversationId,
      conversationAnchorNoteIds: [],
      clientRevision: valid.clientRevision,
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ intent: 'recent_places' });
  });

  it('rejects invented or malformed MCP call metadata', async () => {
    const payload = {
      requestId: valid.requestId,
      serverRevision: valid.clientRevision,
      intent: 'lookup', retrievalStatus: 'supported', status: 'supported',
      answer: '完成。', evidence: [], externalEvidence: [],
      mcpCalls: [{
        server: 'my_life_memory', toolName: 'delete_memory', status: 'completed',
      }],
      confidence: 'none', limitations: [], clarificationOptions: [],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify(payload), { status: 200 },
    )));

    await expect(requestEmotionChat({
      auth: {
        supabaseUrl: 'https://project.supabase.co',
        publishableKey: 'publishable', accessToken: 'access', userId: 'user-a',
      },
      requestId: valid.requestId,
      message: valid.message,
      language: 'zh',
      conversationId: valid.conversationId,
      conversationAnchorNoteIds: [],
      clientRevision: valid.clientRevision,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('accepts generation rejection only when retrieval itself succeeded', async () => {
    const payload = {
      requestId: valid.requestId,
      serverRevision: valid.clientRevision,
      intent: 'lookup',
      retrievalStatus: 'supported',
      status: 'generation_rejected',
      answer: '当前生成没有通过检查。',
      evidence: [], externalEvidence: [], confidence: 'none',
      limitations: ['generation_rejected'], clarificationOptions: [],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...payload,
        retrievalStatus: 'not_found',
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const input = {
      auth: {
        supabaseUrl: 'https://project.supabase.co',
        publishableKey: 'publishable', accessToken: 'access', userId: 'user-a',
      },
      requestId: valid.requestId,
      message: valid.message,
      language: 'zh' as const,
      conversationId: valid.conversationId,
      conversationAnchorNoteIds: [],
      clientRevision: valid.clientRevision,
      signal: new AbortController().signal,
    };
    expect((await requestEmotionChat(input))?.status).toBe('generation_rejected');
    await expect(requestEmotionChat(input)).rejects.toMatchObject({
      name: EmotionChatRequestError.name,
      code: 'invalid_response',
    });
  });

  it('reuses the same request after a temporary idempotency in-progress response', async () => {
    const payload = {
      requestId: valid.requestId,
      serverRevision: valid.clientRevision,
      intent: 'lookup',
      retrievalStatus: 'supported',
      status: 'supported',
      answer: '找到了这条记录。',
      evidence: [],
      externalEvidence: [],
      confidence: 'medium',
      limitations: [],
      clarificationOptions: [],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'retryable', code: 'request_in_progress',
      }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestEmotionChat({
      auth: {
        supabaseUrl: 'https://project.supabase.co',
        publishableKey: 'publishable', accessToken: 'access', userId: 'user-a',
      },
      requestId: valid.requestId,
      message: valid.message,
      language: 'zh',
      conversationId: valid.conversationId,
      conversationAnchorNoteIds: [],
      clientRevision: valid.clientRevision,
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ answer: '找到了这条记录。' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.body).toBe(fetchMock.mock.calls[1][1]?.body);
  });

  it('retries once without recent messages against the previous deployed boundary', async () => {
    const payload = {
      requestId: valid.requestId,
      serverRevision: valid.clientRevision,
      intent: 'lookup',
      retrievalStatus: 'supported',
      status: 'supported',
      answer: '我们继续聊这条记录。',
      evidence: [],
      externalEvidence: [],
      confidence: 'medium',
      limitations: [],
      clarificationOptions: [],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 'invalid_request',
      }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestEmotionChat({
      auth: {
        supabaseUrl: 'https://project.supabase.co',
        publishableKey: 'publishable', accessToken: 'access', userId: 'user-a',
      },
      requestId: valid.requestId,
      message: valid.message,
      language: 'zh',
      conversationId: valid.conversationId,
      conversationAnchorNoteIds: [],
      stylePrompt: '自然一点',
      recentMessages: [{ role: 'user', body: '前一句话' }],
      clientRevision: valid.clientRevision,
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ answer: '我们继续聊这条记录。' });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toHaveProperty(
      'recentMessages',
    );
    const legacyBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(legacyBody).not.toHaveProperty('recentMessages');
    expect(legacyBody).not.toHaveProperty('stylePrompt');
  });

  it('accepts a bounded casual-chat response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      requestId: valid.requestId,
      serverRevision: valid.clientRevision,
      intent: 'casual',
      retrievalStatus: 'supported',
      status: 'supported',
      answer: '当然可以，我们就随便聊聊。',
      evidence: [], externalEvidence: [], confidence: 'none', limitations: [],
      clarificationOptions: [],
    }), { status: 200 })));

    await expect(requestEmotionChat({
      auth: {
        supabaseUrl: 'https://project.supabase.co',
        publishableKey: 'publishable', accessToken: 'access', userId: 'user-a',
      },
      requestId: valid.requestId,
      message: '可以随便聊聊吗？',
      language: 'zh',
      conversationId: valid.conversationId,
      conversationAnchorNoteIds: [],
      clientRevision: valid.clientRevision,
      signal: new AbortController().signal,
    })).resolves.toMatchObject({
      intent: 'casual',
      answer: '当然可以，我们就随便聊聊。',
    });
  });
});
