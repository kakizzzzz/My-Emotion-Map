import type { ChatLanguage } from './chatGrounding.ts';
import { requestSiliconFlowJson } from './siliconflow.ts';
import { parseAiSourcePlan, type SourcePlan } from './sourcePlan.ts';

const plannerSystemPrompt = `You are the tool planner for My Emotion Map. Decide from the meaning of the latest user message and recent conversation whether the answer needs personal-record retrieval. Do not answer the user. Return JSON only as {"source":"emotion_map_local|my_life_memory|both|unsupported","tools":[],"maxCalls":0,"searchQuery":"","resultMode":"recent_places"} and omit optional fields that do not apply.

Source policy:
- emotion_map_local: ordinary conversation with no record lookup, live/current questions that no available tool can verify, or a lookup specifically limited to stars and notes stored in My Emotion Map.
- both: a request about the user's own past experiences, places, trips, days, routes, photos, or memories when My Emotion Map should be searched first and My Life Memory may add context. Understand arbitrary natural phrasing and conversation references; never require a special command, product name, country, or keyword.
- A question asking whether you remember or know where, when, how, or during which event something happened in the user's own past is record retrieval and must use both, not ordinary conversation.
- my_life_memory: only when the user explicitly limits the lookup to My Life Memory or its MCP.
- unsupported: requests to diagnose or infer personality, mental disorders, subconscious motives, attachment, or other disallowed hidden traits from personal records.

Tool policy for my_life_memory or both:
- research_memory_context: the default semantic lookup for personal memories and follow-up references.
- search_memories, get_day_memory, summarize_memory_range: choose one only for an explicit literal search, exact YYYY-MM-DD day, or aggregate date range. For ordinary natural-language memory questions, prefer research_memory_context.
- For a request to list several recent saved places, ask where the user has recently gone or played without explicitly limiting it to one place, or order recent places from newest to oldest, choose ["search_memories"] with maxCalls 1 and resultMode "recent_places". This mode reads multiple saved records, sorts by stored time, and keeps distinct saved locations. Omit searchQuery for this mode. Never use it to claim the user's current live location.
- For a singular question about the one latest or last saved place, or what happened at that single latest place, choose ["list_locations","get_location_memory"] with maxCalls 2. The executor will select the newest returned star by its stored creation time and provide its server-owned starId to the second tool. Never use this chain to claim the user's current live location.
- Treat natural questions such as "Where did I go last time?", "What was my last outing?", "我上一次出去玩的地方是哪", and "지난번에 어디에 갔어?" as personal-record lookups with source both and the singular two-tool chain above, even when the user does not name either app or MCP.
- Contrast: "Where have I been recently?" asks for several recent saved places unless the user explicitly says one, last, latest, or most recent. Use the recent_places mode for that plural or open-ended meaning.
- list_locations alone is for a complete saved-location list. get_location_memory is valid only as the second tool immediately after list_locations; never select it alone.
- get_routes: saved route or movement-path retrieval.
- get_memory_images: only when the user asks to inspect, find, compare, or describe saved photos/images; pair it after research_memory_context, making two calls.
Use at most two tools. For emotion_map_local and unsupported, tools must be [] and maxCalls 0. For external sources, maxCalls must equal tools.length. Never select write, delete, edit, account, permission, or unknown tools.
For my_life_memory or both, include searchQuery as a short literal phrase (place, event, object, date, or activity) copied or safely condensed from the user's request and recent context, suitable for an exact fallback search, except when resultMode is recent_places. Do not include product names, commands, question framing, or filler words. For emotion_map_local and unsupported, omit searchQuery and resultMode entirely.`;

export const planChatWithModel = async ({
  message,
  language,
  recentMessages,
}: {
  message: string;
  language: ChatLanguage;
  recentMessages: Array<{ role: 'user' | 'assistant'; body: string }>;
}): Promise<SourcePlan> => {
  const raw = await requestSiliconFlowJson({
    task: 'plan',
    timeoutMs: 12_000,
    maxTokens: 180,
    messages: [
      { role: 'system', content: plannerSystemPrompt },
      {
        role: 'user',
        content: JSON.stringify({
          language: 'zh', recentMessages: [],
          latestMessage: '我上一次出去玩的地方是哪',
        }),
      },
      {
        role: 'assistant',
        content: JSON.stringify({
          source: 'both',
          tools: ['list_locations', 'get_location_memory'],
          maxCalls: 2,
          searchQuery: '上一次出去玩的地方',
        }),
      },
      {
        role: 'user',
        content: JSON.stringify({
          language: 'zh', recentMessages: [],
          latestMessage: '我最近在哪里玩',
        }),
      },
      {
        role: 'assistant',
        content: JSON.stringify({
          source: 'both', tools: ['search_memories'], maxCalls: 1,
          resultMode: 'recent_places',
        }),
      },
      {
        role: 'user',
        content: JSON.stringify({ language, recentMessages, latestMessage: message }),
      },
    ],
  });
  const plan = parseAiSourcePlan(raw);
  if (!plan) throw new Error('invalid_chat_plan');
  return plan;
};
