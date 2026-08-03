import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('AI runtime contracts', () => {
  it('uses a fast non-thinking chat model', () => {
    const provider = read('supabase/functions/_shared/siliconflow.ts');
    expect(provider).toContain("const CHAT_MODEL = 'Qwen/Qwen3.5-35B-A3B'");
    expect(provider).toContain("const PLAN_MODEL = 'Qwen/Qwen3.5-35B-A3B'");
    expect(provider).toContain("enable_thinking: false");
  });

  it('lets the model plan arbitrary read-only tool use before execution', () => {
    const planner = read('supabase/functions/_shared/chatPlanner.ts');
    const chat = read('supabase/functions/emotion-chat/index.ts');
    expect(planner).toContain('Decide from the meaning of the latest user message');
    expect(planner).toContain('never require a special command, product name, country, or keyword');
    expect(planner).toContain('["list_locations","get_location_memory"]');
    expect(planner).toContain('resultMode "recent_places"');
    expect(planner).toContain('Where did I go last time?');
    expect(planner).toContain("task: 'plan'");
    expect(chat).toContain('await planChatWithModel(planBody)');
    expect(chat).toContain('verifyChatPlanToken(');
    expect(chat).toContain('verifiedPlan?.plan ?? planChatSources');
  });

  it('routes every casual message through the model with recent context', () => {
    const chat = read('supabase/functions/emotion-chat/index.ts');
    expect(chat).toContain('recentMessages: body.recentMessages');
    expect(chat).toContain('await generateCasual({');
    expect(chat).toContain('if (casualEligible)');
    expect(chat).not.toContain('if (!evidence.length && casualEligible)');
    expect(chat).toContain("For a question about current external facts such as today's weather");
    expect(chat).not.toContain('casualFallback(');
    expect(chat).not.toContain('casualQuickReply(');
  });

  it('protects voice summaries with auth, quota, and strict request validation', () => {
    const voice = read('supabase/functions/voice-summary/index.ts');
    expect(voice).toContain('authenticate(request)');
    expect(voice).toContain("claimAiQuota(session, 'voice-summary')");
    expect(voice).toContain("new Set(['transcript', 'language', 'target'])");
  });
});
