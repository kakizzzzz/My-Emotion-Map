const DEDUPE_STORAGE_KEY = 'my-emotion-map.shortcut-heart-dedupe';
const MAX_DEDUPE_IDS = 120;

export const stripShortcutFragment = () => {
  const hash = window.location.hash;
  if (!hash.startsWith('#shortcut-heart')) return '';
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`,
  );
  return hash;
};

const dedupeKey = (userId: string) => `${DEDUPE_STORAGE_KEY}.${userId}.v2`;

export const loadShortcutEventIds = (userId: string): Set<string> => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(dedupeKey(userId)) ?? '[]');
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string').slice(-MAX_DEDUPE_IDS)
        : [],
    );
  } catch {
    return new Set();
  }
};

export const rememberShortcutEventId = (userId: string, sourceEventId: string) => {
  const ids = loadShortcutEventIds(userId);
  ids.add(sourceEventId);
  try {
    window.localStorage.setItem(
      dedupeKey(userId),
      JSON.stringify(Array.from(ids).slice(-MAX_DEDUPE_IDS)),
    );
  } catch {
    // The health observation can still be handled in memory when storage is unavailable.
  }
};

export const SHORTCUT_HEART_DEDUPE_STORAGE_KEY = DEDUPE_STORAGE_KEY;
