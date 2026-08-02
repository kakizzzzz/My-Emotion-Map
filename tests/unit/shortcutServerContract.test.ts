import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/202608020003_phase3_heart_shortcut.sql'),
  'utf8',
);
const edge = readFileSync(
  resolve(process.cwd(), 'supabase/functions/shortcut-ingress/index.ts'),
  'utf8',
);

describe('Shortcut v3 server contract', () => {
  it('keeps evaluation shared and persistence behind a service-role RPC', () => {
    expect(edge).toContain("from '../_shared/heartObservationV3.ts'");
    expect(edge).toContain('/rpc/record_shortcut_observation_v3');
    expect(migration).toContain("grant execute on function public.record_shortcut_observation_v3");
    expect(migration).toContain('to service_role;');
    expect(migration).not.toMatch(
      /grant execute on function public\.record_shortcut_observation_v3[\s\S]{0,250}to authenticated/,
    );
  });

  it('persists idempotent episode and delivery state', () => {
    expect(migration).toContain('create table if not exists public.shortcut_observation_events');
    expect(migration).toContain('unique (user_id, event_id)');
    expect(migration).toContain('perform pg_advisory_xact_lock');
    expect(migration).toContain("status in ('pending', 'delivered')");
    expect(migration).toContain('(observation.created_at, observation.id) >');
    expect(migration).toContain('public.ack_shortcut_observations');
  });

  it('contains no local fabricated test observation path', () => {
    expect(edge).toContain('p_is_test: payload.test === true');
    expect(edge).not.toContain('settings-test-v1');
    expect(edge).not.toContain('heartRate: 108');
  });
});
