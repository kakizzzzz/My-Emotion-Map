import { describe, expect, it } from 'vitest';
import {
  digestContinuationCandidate,
  issueContinuationToken,
  verifyContinuationToken,
} from '../../supabase/functions/_shared/continuationToken';

const secret = 'server-only-secret-that-is-long-enough-for-hmac';

describe('chat continuation tokens', () => {
  it('binds an option to the user, revision, query, candidates and expiry', async () => {
    const digest = await digestContinuationCandidate('note-1');
    const token = await issueContinuationToken({
      version: 1,
      userId: 'user-1',
      revision: 8,
      query: '图书馆那条是什么？',
      optionId: 'candidate-1',
      candidateDigests: [digest],
      selectedDigest: digest,
      expiresAt: 1_000_000,
    }, secret);
    expect(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/').padEnd(
      Math.ceil(token.split('.')[0].length / 4) * 4,
      '=',
    ))).not.toContain('note-1');
    const verified = await verifyContinuationToken(token, secret, {
      userId: 'user-1', revision: 8, optionId: 'candidate-1',
    }, 999_000);
    expect(verified?.query).toBe('图书馆那条是什么？');
    expect(await verifyContinuationToken(token, secret, {
      userId: 'user-2', revision: 8, optionId: 'candidate-1',
    }, 999_000)).toBeNull();
    expect(await verifyContinuationToken(token, secret, {
      userId: 'user-1', revision: 9, optionId: 'candidate-1',
    }, 999_000)).toBeNull();
    expect(await verifyContinuationToken(token, secret, {
      userId: 'user-1', revision: 8, optionId: 'candidate-1',
    }, 1_000_001)).toBeNull();
    const tampered = `${token.slice(0, 4)}x${token.slice(5)}`;
    expect(await verifyContinuationToken(tampered, secret, {
      userId: 'user-1', revision: 8, optionId: 'candidate-1',
    }, 999_000)).toBeNull();
  });
});
