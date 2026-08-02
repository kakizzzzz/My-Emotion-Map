import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthMode = 'login' | 'register';
export type AuthResult =
  | 'signed_in'
  | 'confirmation_required'
  | 'account_exists'
  | 'rate_limited'
  | 'weak_password'
  | 'invalid_credentials'
  | 'unavailable';

type FunctionFailure = {
  status: number;
  code: string;
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const readFunctionFailure = async (error: unknown): Promise<FunctionFailure> => {
  const source = asObject(error);
  const context = source?.context;
  const response = context instanceof Response ? context : null;
  const payload = response
    ? asObject(await response.clone().json().catch(() => null))
    : asObject(source?.data);

  return {
    status: response?.status ?? 0,
    code: typeof payload?.code === 'string' ? payload.code : '',
  };
};

export const normalizeAccountId = (accountId: string) =>
  accountId.trim().toLowerCase();

export const isValidAccountId = (accountId: string) =>
  /^[a-z0-9._-]{3,24}$/.test(normalizeAccountId(accountId));

export const accountIdToAuthEmail = (accountId: string) => {
  const normalized = normalizeAccountId(accountId);
  const bytes = new TextEncoder().encode(normalized);
  const hex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `u_${hex}@accounts.my-emotion-map.app`;
};

export const authenticateAccount = async ({
  client,
  mode,
  account,
  password,
  passwordConfirmation,
}: {
  client: SupabaseClient;
  mode: AuthMode;
  account: string;
  password: string;
  passwordConfirmation: string;
}): Promise<AuthResult> => {
  const normalizedAccount = normalizeAccountId(account);
  if (!isValidAccountId(normalizedAccount) || password.length < 8) {
    return 'unavailable';
  }

  if (mode === 'register') {
    if (password !== passwordConfirmation) return 'unavailable';
    const { data, error } = await client.functions.invoke('register-account', {
      body: {
        account: normalizedAccount,
        password,
        passwordConfirmation,
      },
    });
    if (error) {
      const failure = await readFunctionFailure(error);
      if (failure.code === 'rate_limited' || failure.status === 429) {
        return 'rate_limited';
      }
      if (failure.code === 'weak_password' || failure.status === 422) {
        return 'weak_password';
      }
      if (failure.code !== 'account_exists' && failure.status !== 409) {
        return 'unavailable';
      }

      const existingSignIn = await client.auth.signInWithPassword({
        email: accountIdToAuthEmail(normalizedAccount),
        password,
      });
      return !existingSignIn.error
        && existingSignIn.data.session
        && existingSignIn.data.user
        ? 'signed_in'
        : 'account_exists';
    }

    if (asObject(data)?.status !== 'ready') return 'unavailable';
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: accountIdToAuthEmail(normalizedAccount),
    password,
  });
  if (!error && data.session && data.user) return 'signed_in';
  return mode === 'register' ? 'confirmation_required' : 'invalid_credentials';
};
