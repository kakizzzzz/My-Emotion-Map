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
  setSession = validSession,
}: {
  invoke: unknown | unknown[];
  setSession?: unknown;
}) => ({
  functions: {
    invoke: Array.isArray(invoke)
      ? vi.fn()
          .mockResolvedValueOnce(invoke[0])
          .mockResolvedValueOnce(invoke[1])
      : vi.fn().mockResolvedValue(invoke),
  },
  auth: { setSession: vi.fn().mockResolvedValue(setSession) },
}) as unknown as SupabaseClient;

const validSession = {
  data: { session: { access_token: 'test', user: { id: 'user-1' } } },
  error: null,
};

const loginReady = {
  data: {
    status: 'ready',
    session: {
      accessToken: 'access-test',
      refreshToken: 'refresh-test',
      userId: 'user-1',
    },
  },
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
      invoke: [
        { data: { status: 'ready' }, error: null },
        loginReady,
      ],
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
      invoke: [
        { data: null, error: { context } },
        loginReady,
      ],
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
    });

    await expect(authenticateAccount({
      client,
      mode: 'register',
      account: 'student-01',
      password: 'safe-pass-123',
      passwordConfirmation: 'safe-pass-123',
    })).resolves.toBe('rate_limited');
    expect(client.auth.setSession).not.toHaveBeenCalled();
  });

  it('activates a server-resolved legacy account session', async () => {
    const client = clientMock({ invoke: loginReady });

    await expect(authenticateAccount({
      client,
      mode: 'login',
      account: 'kaki',
      password: 'safe-pass-123',
      passwordConfirmation: '',
    })).resolves.toBe('signed_in');
    expect(client.auth.setSession).toHaveBeenCalledWith({
      access_token: 'access-test',
      refresh_token: 'refresh-test',
    });
  });

  it('does not activate a session when the resolved user id changes', async () => {
    const client = clientMock({
      invoke: loginReady,
      setSession: {
        data: { session: { user: { id: 'different-user' } } },
        error: null,
      },
    });

    await expect(authenticateAccount({
      client,
      mode: 'login',
      account: 'kaki',
      password: 'safe-pass-123',
      passwordConfirmation: '',
    })).resolves.toBe('unavailable');
  });
});
