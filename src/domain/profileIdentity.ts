export type ProfileIdentity =
  | { kind: 'user'; userId: string; displayName: string }
  | {
      kind: 'demo';
      localId: string;
      sourceRef: string;
      displayName: string;
    };

export type SupabaseProfileRow = {
  id: string;
  display_name: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isSupabaseProfileId = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

export const toSupabaseProfileRow = (
  identity: ProfileIdentity,
): SupabaseProfileRow | null =>
  identity.kind === 'user' && isSupabaseProfileId(identity.userId)
    ? {
        id: identity.userId,
        display_name: identity.displayName,
      }
    : null;

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
    kind: 'user',
    userId: source.id,
    displayName: source.display_name.trim().slice(0, 80),
  };
};
