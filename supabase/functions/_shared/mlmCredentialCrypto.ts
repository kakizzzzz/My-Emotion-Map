export type EncryptedMlmCredential = {
  ciphertext: string;
  iv: string;
  keyVersion: 1;
};

const decodeBase64 = (value: string) => {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error('credential_key_invalid');
  }
};

const encodeBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const importKey = async (encoded: string) => {
  const bytes = decodeBase64(encoded);
  if (bytes.byteLength !== 32) throw new Error('credential_key_invalid');
  return crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
};

export const encryptMlmCredential = async (
  token: string,
  encodedKey: string,
): Promise<EncryptedMlmCredential> => {
  if (token.length < 20 || token.length > 1_024 || /\s/.test(token)) {
    throw new Error('credential_invalid');
  }
  const key = await importKey(encodedKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(token),
  );
  return {
    ciphertext: encodeBase64(new Uint8Array(ciphertext)),
    iv: encodeBase64(iv),
    keyVersion: 1,
  };
};

export const decryptMlmCredential = async (
  encrypted: EncryptedMlmCredential,
  encodedKey: string,
) => {
  const key = await importKey(encodedKey);
  const iv = decodeBase64(encrypted.iv);
  const ciphertext = decodeBase64(encrypted.ciphertext);
  if (iv.byteLength !== 12 || !ciphertext.byteLength ||
    encrypted.keyVersion !== 1) throw new Error('credential_invalid');
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('credential_invalid');
  }
};

