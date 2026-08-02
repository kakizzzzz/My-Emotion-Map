import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  accountIdToAuthEmail,
  authenticateAccount,
  isValidAccountId,
  normalizeAccountId,
} from '../../src/services/accountAuth';

const clientMock = ({
  invoke,
  signIn,
}: {
  invoke: unknown;
  signIn: unknown;
}) => ({
  functions: { invoke: vi.fn().mockResolvedValue(invoke) },
  auth: { signInWithPassword: vi.fn().mockResolvedValue(signIn) },
}) as unknown as SupabaseClient;

const validSession = {
  data: { session: { access_token: 'test' }, user: { id: 'user-1' } },
  error: null,
};

describe('account authentication mapping', () => {
  it('normalizes account names without exposing a user email address', () => {
    expect(normalizeAccountId('  Student_01  ')).toBe('student_01');
    expect(accountIdToAuthEmail('student_01')).toBe(
      'u_73747564656e745f3031@accounts.my-emotion-map.app',
    );
  });

  it('accepts only bounded account identifiers', () => {
    expect(isValidAccountId('student-01')).toBe(true);
    expect(isValidAccountId('ab')).toBe(false);
    expect(isValidAccountId('student@example.com')).toBe(false);
    expect(isValidAccountId('student account')).toBe(false);
  });

  it('signs in immediately after the registration function succeeds', async () => {
    const client = clientMock({
      invoke: { data: { status: 'ready' }, error: null },
      signIn: validSession,
    });

    await expect(authenticateAccount({
      client,
      mode: 'register',
      account: 'student-01',
      password: 'safe-pass-123',
      passwordConfirmation: 'safe-pass-123',
    })).resolves.toBe('signed_in');
  });

  it('recovers an interrupted registration by signing into an existing account', async () => {
    const context = new Response(JSON.stringify({ code: 'account_exists' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    });
    const client = clientMock({
      invoke: { data: null, error: { context } },
      signIn: validSession,
    });

    await expect(authenticateAccount({
      client,
      mode: 'register',
      account: 'student-01',
      password: 'safe-pass-123',
      passwordConfirmation: 'safe-pass-123',
    })).resolves.toBe('signed_in');
  });

  it('returns a specific retry state without attempting sign-in when rate limited', async () => {
    const context = new Response(JSON.stringify({ code: 'rate_limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
    const client = clientMock({
      invoke: { data: null, error: { context } },
      signIn: validSession,
    });

    await expect(authenticateAccount({
      client,
      mode: 'register',
      account: 'student-01',
      password: 'safe-pass-123',
      passwordConfirmation: 'safe-pass-123',
    })).resolves.toBe('rate_limited');
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
