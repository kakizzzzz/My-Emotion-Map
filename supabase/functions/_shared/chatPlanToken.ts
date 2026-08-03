import { parseAiSourcePlan, type SourcePlan } from './sourcePlan.ts';

type ChatPlanPayload = {
  version: 1;
  userId: string;
  requestId: string;
  revision: number;
  inputDigest: string;
  plan: SourcePlan;
  expiresAt: number;
};

const encoder = new TextEncoder();

const base64Url = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const importKey = (secret: string) => crypto.subtle.importKey(
  'raw',
  encoder.encode(secret),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign', 'verify'],
);

export const digestChatPlanInput = async ({
  message,
  conversationId,
  recentMessages,
}: {
  message: string;
  conversationId: string;
  recentMessages: Array<{ role: 'user' | 'assistant'; body: string }>;
}) => {
  const canonical = JSON.stringify({ message, conversationId, recentMessages });
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(canonical));
  return base64Url(new Uint8Array(digest));
};

export const issueChatPlanToken = async (
  payload: ChatPlanPayload,
  secret: string,
) => {
  if (!secret || secret.length < 32) throw new Error('chat_plan_unavailable');
  const encoded = base64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await importKey(secret),
    encoder.encode(encoded),
  );
  return `${encoded}.${base64Url(new Uint8Array(signature))}`;
};

export const verifyChatPlanToken = async (
  token: string,
  secret: string,
  expected: {
    userId: string;
    requestId: string;
    revision: number;
    inputDigest: string;
  },
  now = Date.now(),
): Promise<ChatPlanPayload | null> => {
  if (!secret || token.length > 4_000) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await importKey(secret),
      decodeBase64Url(parts[1]),
      encoder.encode(parts[0]),
    );
    if (!valid) return null;
    const raw = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(parts[0])),
    ) as Record<string, unknown>;
    const plan = parseAiSourcePlan(raw.plan);
    if (
      raw.version !== 1 ||
      raw.userId !== expected.userId ||
      raw.requestId !== expected.requestId ||
      raw.revision !== expected.revision ||
      raw.inputDigest !== expected.inputDigest ||
      !plan ||
      typeof raw.expiresAt !== 'number' ||
      raw.expiresAt < now || raw.expiresAt > now + 10 * 60_000
    ) return null;
    return { ...raw, plan } as ChatPlanPayload;
  } catch {
    return null;
  }
};
