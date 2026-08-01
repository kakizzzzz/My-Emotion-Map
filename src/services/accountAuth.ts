import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthMode = 'login' | 'register';
export type AuthResult = 'signed_in' | 'confirmation_required' | 'unavailable';

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
    const { error } = await client.functions.invoke('register-account', {
      body: {
        account: normalizedAccount,
        password,
        passwordConfirmation,
      },
    });
    if (error) return 'unavailable';
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: accountIdToAuthEmail(normalizedAccount),
    password,
  });
  return !error && data.session && data.user ? 'signed_in' : 'unavailable';
};
