import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'supabase/functions/login-account/index.ts'),
  'utf8',
);
const registrationSource = readFileSync(
  resolve(process.cwd(), 'supabase/functions/register-account/index.ts'),
  'utf8',
);
const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/202608020006_account_login_recovery.sql',
  ),
  'utf8',
);

describe('account login Edge Function contract', () => {
  it('resolves the account server-side and validates the password with Supabase Auth', () => {
    expect(source).toContain('/rest/v1/account_profiles?account_id=eq.');
    expect(source).toContain('/auth/v1/token?grant_type=password');
    expect(source).toContain("user?.id !== account.userId");
  });

  it('uses exact-origin CORS, bounded input and rate limiting', () => {
    expect(source).toContain('requireAllowedOrigin(request)');
    expect(source).toContain("body.password.length > 200");
    expect(source).toContain('claim_registration_quota');
    expect(source).toContain("code: 'rate_limited'");
    expect(source).toContain("code: 'quota_unavailable'");
  });

  it('never returns the resolved email or password', () => {
    const responseStart = source.indexOf("return jsonResponse({\n      status: 'ready'");
    expect(responseStart).toBeGreaterThan(0);
    const responseBlock = source.slice(responseStart);
    expect(responseBlock).not.toContain('account.email');
    expect(responseBlock).not.toContain('body.password');
  });

  it('backfills only unambiguous legacy ownership without replacing a mapping', () => {
    expect(migration).toContain("users.raw_user_meta_data ->> 'account_id'");
    expect(migration).toContain('having count(*) = 1');
    expect(migration).toContain('on conflict do nothing');
  });

  it('initializes normalized storage before registration becomes ready', () => {
    expect(registrationSource).toContain(
      '/rest/v1/rpc/initialize_normalized_emotion_account',
    );
    expect(registrationSource).toContain('p_user_id: createdUserId');
    expect(registrationSource).toContain('p_profile_name: body.account');
    expect(registrationSource.indexOf('initialize_normalized_emotion_account'))
      .toBeLessThan(
        registrationSource.indexOf("return jsonResponse({ status: 'ready' }, 201"),
      );
    expect(registrationSource).toContain(
      'await deleteCreatedUser(supabaseUrl, serviceRoleKey, createdUserId)',
    );
  });
});
