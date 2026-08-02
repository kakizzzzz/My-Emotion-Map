import type { AppDataSnapshot, DataMode } from '../../types';

export const LEGACY_APP_DATA_STORAGE_KEY = 'my-emotion-map.app-data.v1';
export const DEMO_WORKSPACE_STORAGE_KEY = 'my-emotion-map.workspace.demo.v3';
export const DEVICE_PREFERENCES_STORAGE_KEY =
  'my-emotion-map.device-preferences.v2';
export const MAX_SERIALIZED_WORKSPACE_BYTES = 3_500_000;

export const userWorkspaceStorageKey = (userId: string) =>
  `my-emotion-map.workspace.user.${userId}.v4`;

export const userPreferencesStorageKey = (userId: string) =>
  `my-emotion-map.user-preferences.${userId}.v2`;

export const workspaceStorageKey = (
  mode: DataMode,
  userId: string | null,
) => {
  if (mode === 'demo') return DEMO_WORKSPACE_STORAGE_KEY;
  if (!userId) return null;
  return userWorkspaceStorageKey(userId);
};

export const stableSerialize = (value: unknown): string => {
  const seen = new WeakSet<object>();
  const normalize = (input: unknown): unknown => {
    if (!input || typeof input !== 'object') return input;
    if (seen.has(input as object)) throw new TypeError('Circular data');
    seen.add(input as object);
    if (Array.isArray(input)) return input.map(normalize);
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalize(item)]),
    );
  };
  return JSON.stringify(normalize(value));
};

export const isWorkspaceWithinBudget = (snapshot: AppDataSnapshot) =>
  new Blob([stableSerialize(snapshot)]).size <= MAX_SERIALIZED_WORKSPACE_BYTES;
