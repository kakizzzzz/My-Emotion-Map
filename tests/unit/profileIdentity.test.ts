import { describe, expect, it } from 'vitest';
import {
  fromSupabaseProfileRow,
  isSupabaseProfileId,
  toSupabaseProfileRow,
} from '../../src/domain/profileIdentity';

const PROFILE = {
  kind: 'user' as const,
  userId: '7c5e2f8a-4c6f-4c1d-9b2f-2a6f5e8d2026',
  displayName: 'student_01',
};

describe('profile identity contract', () => {
  it('recognizes a UUID-compatible signed-in identity', () => {
    expect(isSupabaseProfileId(PROFILE.userId)).toBe(true);
  });

  it('maps the local profile shape to Supabase columns and back', () => {
    const row = toSupabaseProfileRow(PROFILE);

    expect(row).toEqual({
      id: PROFILE.userId,
      display_name: PROFILE.displayName,
    });
    expect(fromSupabaseProfileRow(row)).toEqual(PROFILE);
  });

  it('rejects malformed cloud profile rows', () => {
    expect(
      fromSupabaseProfileRow({
        id: 'not-a-uuid',
        display_name: 'student_01',
      }),
    ).toBeNull();
    expect(
      fromSupabaseProfileRow({
        id: PROFILE.userId,
        display_name: '   ',
      }),
    ).toBeNull();
  });

  it('never maps a malformed user id into the cloud profile table', () => {
    expect(toSupabaseProfileRow({
      kind: 'user',
      userId: 'local-only',
      displayName: 'Local user',
    })).toBeNull();
  });
});
