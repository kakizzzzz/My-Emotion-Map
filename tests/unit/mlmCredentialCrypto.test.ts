import { describe, expect, it } from 'vitest';
import {
  decryptMlmCredential,
  encryptMlmCredential,
} from '../../supabase/functions/_shared/mlmCredentialCrypto';

describe('My Life Memory credential encryption', () => {
  it('round-trips with AES-GCM without storing plaintext', async () => {
    const key = btoa('0123456789abcdef0123456789abcdef');
    const token = `mlm_${'a'.repeat(64)}`;
    const encrypted = await encryptMlmCredential(token, key);

    expect(encrypted.ciphertext).not.toContain(token);
    expect(encrypted.iv).not.toContain(token);
    expect(await decryptMlmCredential(encrypted, key)).toBe(token);
  });

  it('rejects malformed encryption keys', async () => {
    await expect(encryptMlmCredential('token-value-long-enough', 'short'))
      .rejects.toThrow('credential_key_invalid');
  });
});
