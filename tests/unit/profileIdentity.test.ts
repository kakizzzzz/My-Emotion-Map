import { describe, expect, it } from 'vitest';
import {
  DEMO_PROFILE_IDENTITY,
  fromSupabaseProfileRow,
  isSupabaseProfileId,
  toSupabaseProfileRow,
} from '../../src/domain/profileIdentity';

describe('profile identity contract', () => {
  it('uses a fictional UUID-compatible identity for Demo mode', () => {
    expect(DEMO_PROFILE_IDENTITY.displayName).toBe('Mina Park');
    expect(isSupabaseProfileId(DEMO_PROFILE_IDENTITY.id)).toBe(true);
  });

  it('maps the local profile shape to Supabase columns and back', () => {
    const row = toSupabaseProfileRow(DEMO_PROFILE_IDENTITY);

    expect(row).toEqual({
      id: DEMO_PROFILE_IDENTITY.id,
      display_name: DEMO_PROFILE_IDENTITY.displayName,
    });
    expect(fromSupabaseProfileRow(row)).toEqual(DEMO_PROFILE_IDENTITY);
  });

  it('rejects malformed cloud profile rows', () => {
    expect(
      fromSupabaseProfileRow({
        id: 'not-a-uuid',
        display_name: 'Mina Park',
      }),
    ).toBeNull();
    expect(
      fromSupabaseProfileRow({
        id: DEMO_PROFILE_IDENTITY.id,
        display_name: '   ',
      }),
    ).toBeNull();
  });
});
