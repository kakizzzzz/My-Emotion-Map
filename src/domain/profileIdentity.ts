export type ProfileIdentity = {
  id: string;
  displayName: string;
};

export type SupabaseProfileRow = {
  id: string;
  display_name: string;
};

export const DEMO_PROFILE_IDENTITY: ProfileIdentity = {
  id: '7c5e2f8a-4c6f-4c1d-9b2f-2a6f5e8d2026',
  displayName: 'Mina Park',
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isSupabaseProfileId = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

export const toSupabaseProfileRow = (
  identity: ProfileIdentity,
): SupabaseProfileRow => ({
  id: identity.id,
  display_name: identity.displayName,
});

export const fromSupabaseProfileRow = (
  row: unknown,
): ProfileIdentity | null => {
  if (!row || typeof row !== 'object') return null;
  const source = row as Partial<SupabaseProfileRow>;
  if (
    !isSupabaseProfileId(source.id) ||
    typeof source.display_name !== 'string' ||
    !source.display_name.trim()
  ) {
    return null;
  }
  return {
    id: source.id,
    displayName: source.display_name.trim().slice(0, 80),
  };
};
