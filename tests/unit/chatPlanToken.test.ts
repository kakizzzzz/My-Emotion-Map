import { describe, expect, it } from 'vitest';
import {
  digestChatPlanInput,
  issueChatPlanToken,
  verifyChatPlanToken,
} from '../../supabase/functions/_shared/chatPlanToken';

describe('signed chat routing plans', () => {
  const secret = 's'.repeat(48);
  const input = {
    message: '帮我回忆某次远行',
    conversationId: 'conversation-1',
    recentMessages: [{ role: 'user' as const, body: '那段经历很特别' }],
  };

  it('binds a model plan to the user, request, revision, and conversation input', async () => {
    const inputDigest = await digestChatPlanInput(input);
    const token = await issueChatPlanToken({
      version: 1,
      userId: 'user-a',
      requestId: 'request-a',
      revision: 8,
      inputDigest,
      plan: {
        source: 'both', tools: ['research_memory_context'], maxCalls: 1,
        searchQuery: '远行',
      },
      expiresAt: 5_000,
    }, secret);
    await expect(verifyChatPlanToken(token, secret, {
      userId: 'user-a', requestId: 'request-a', revision: 8, inputDigest,
    }, 1_000)).resolves.toMatchObject({ plan: { source: 'both' } });
    const changedDigest = await digestChatPlanInput({
      ...input, message: '完全不同的问题',
    });
    await expect(verifyChatPlanToken(token, secret, {
      userId: 'user-a', requestId: 'request-a', revision: 8,
      inputDigest: changedDigest,
    }, 1_000)).resolves.toBeNull();
  });

  it('rejects tampering and expired plans', async () => {
    const inputDigest = await digestChatPlanInput(input);
    const token = await issueChatPlanToken({
      version: 1,
      userId: 'user-a', requestId: 'request-a', revision: 8, inputDigest,
      plan: { source: 'emotion_map_local', tools: [], maxCalls: 0 },
      expiresAt: 2_000,
    }, secret);
    const expected = {
      userId: 'user-a', requestId: 'request-a', revision: 8, inputDigest,
    };
    await expect(verifyChatPlanToken(`${token}x`, secret, expected, 1_000))
      .resolves.toBeNull();
    await expect(verifyChatPlanToken(token, secret, expected, 3_000))
      .resolves.toBeNull();
  });
});
