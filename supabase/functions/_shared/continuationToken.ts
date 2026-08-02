type ContinuationPayload = {
  version: 1;
  userId: string;
  revision: number;
  query: string;
  optionId: string;
  candidateDigests: string[];
  selectedDigest: string;
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

export const digestContinuationCandidate = async (noteId: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(noteId));
  return base64Url(new Uint8Array(digest));
};

export const issueContinuationToken = async (
  payload: ContinuationPayload,
  secret: string,
) => {
  if (!secret || secret.length < 32) throw new Error('continuation_unavailable');
  const encoded = base64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await importKey(secret),
    encoder.encode(encoded),
  );
  return `${encoded}.${base64Url(new Uint8Array(signature))}`;
};

export const verifyContinuationToken = async (
  token: string,
  secret: string,
  expected: { userId: string; revision: number; optionId: string },
  now = Date.now(),
): Promise<ContinuationPayload | null> => {
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
    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(parts[0])),
    ) as Partial<ContinuationPayload>;
    if (
      payload.version !== 1 ||
      payload.userId !== expected.userId ||
      payload.revision !== expected.revision ||
      payload.optionId !== expected.optionId ||
      typeof payload.query !== 'string' ||
      !payload.query || payload.query.length > 1_200 ||
      !Array.isArray(payload.candidateDigests) ||
      payload.candidateDigests.length < 1 || payload.candidateDigests.length > 3 ||
      payload.candidateDigests.some((item) => typeof item !== 'string') ||
      typeof payload.selectedDigest !== 'string' ||
      !payload.candidateDigests.includes(payload.selectedDigest) ||
      typeof payload.expiresAt !== 'number' ||
      payload.expiresAt < now || payload.expiresAt > now + 15 * 60_000
    ) return null;
    return payload as ContinuationPayload;
  } catch {
    return null;
  }
};
