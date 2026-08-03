const REQUIRED_BASE_URL = 'https://api.siliconflow.cn/v1';
const PHOTO_MODEL = 'zai-org/GLM-4.5V';
const CHAT_MODEL = 'Qwen/Qwen3.5-35B-A3B';
const PLAN_MODEL = 'Qwen/Qwen3.5-35B-A3B';

type SiliconFlowMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail: 'low' } }
  >;
};

export type SiliconFlowFailureCode =
  | 'provider_unavailable'
  | 'provider_retryable'
  | 'provider_invalid_json';

export class SiliconFlowFailure extends Error {
  constructor(public readonly code: SiliconFlowFailureCode) {
    super(code);
  }
}

const readProviderConfig = (task: 'photo' | 'chat' | 'plan') => {
  // The real provider credential is intentionally read only here, inside the
  // Edge runtime. Never return or log this value.
  const apiKey = Deno.env.get('SILICONFLOW_API_KEY')?.trim() ?? '';
  const baseUrl = Deno.env.get('SILICONFLOW_BASE_URL')?.trim().replace(/\/$/, '') ?? '';
  const modelEnvironment = task === 'photo'
    ? 'SILICONFLOW_PHOTO_MODEL'
    : task === 'plan' ? 'SILICONFLOW_PLAN_MODEL' : 'SILICONFLOW_CHAT_MODEL';
  const configuredModel = Deno.env.get(modelEnvironment)?.trim() ?? '';
  const requiredModel = task === 'photo'
    ? PHOTO_MODEL
    : task === 'plan' ? PLAN_MODEL : CHAT_MODEL;
  if (!apiKey || baseUrl !== REQUIRED_BASE_URL || configuredModel !== requiredModel) {
    throw new SiliconFlowFailure('provider_unavailable');
  }
  return { apiKey, baseUrl, model: requiredModel };
};

const parseJsonContent = (payload: unknown) => {
  const choices = payload && typeof payload === 'object'
    ? (payload as { choices?: unknown }).choices
    : null;
  const first = Array.isArray(choices) ? choices[0] : null;
  const message = first && typeof first === 'object'
    ? (first as { message?: unknown }).message
    : null;
  const content = message && typeof message === 'object'
    ? (message as { content?: unknown }).content
    : null;
  if (typeof content !== 'string' || !content.trim()) return null;
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
};

export const requestSiliconFlowJson = async ({
  task,
  messages,
  timeoutMs,
  maxTokens: requestedMaxTokens,
}: {
  task: 'photo' | 'chat' | 'plan';
  messages: SiliconFlowMessage[];
  timeoutMs?: number;
  maxTokens?: number;
}) => {
  const config = readProviderConfig(task);
  const maximumTimeoutMs = task === 'photo' ? 15_000 : task === 'plan' ? 12_000 : 20_000;
  const requestTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.max(1, Math.min(maximumTimeoutMs, Math.floor(timeoutMs as number)))
    : maximumTimeoutMs;
  let maxTokens = task === 'photo' ? 220 : task === 'plan' ? 180 : 500;
  if (Number.isFinite(requestedMaxTokens)) {
    maxTokens = Math.max(80, Math.min(maxTokens, Math.floor(requestedMaxTokens as number)));
  }
  const temperature = task === 'plan' ? 0.05 : task === 'photo' ? 0.1 : 0.15;
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(task === 'chat' || task === 'plan' ? { enable_thinking: false } : {}),
        response_format: { type: 'json_object' },
        stream: false,
      }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    console.error('siliconflow_fetch_failed', {
      task,
      model: config.model,
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    throw new SiliconFlowFailure('provider_retryable');
  }

  if (!response.ok) {
    console.error('siliconflow_response_failed', {
      task,
      model: config.model,
      status: response.status,
    });
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new SiliconFlowFailure(retryable ? 'provider_retryable' : 'provider_unavailable');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    console.error('siliconflow_invalid_response_json', {
      task,
      model: config.model,
    });
    throw new SiliconFlowFailure('provider_invalid_json');
  }
  const result = parseJsonContent(payload);
  if (result !== null) return result;
  console.error('siliconflow_invalid_model_json', {
    task,
    model: config.model,
  });
  throw new SiliconFlowFailure('provider_invalid_json');
};
