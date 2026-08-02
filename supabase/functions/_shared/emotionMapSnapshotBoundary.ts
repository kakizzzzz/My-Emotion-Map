export const EMOTION_MAP_SUPPORTED_SCHEMA_VERSION = 6;

export const supportsEmotionMapSnapshot = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  const schemaVersion = (value as Record<string, unknown>).schemaVersion;
  return schemaVersion === undefined ||
    (Number.isSafeInteger(schemaVersion) &&
      Number(schemaVersion) <= EMOTION_MAP_SUPPORTED_SCHEMA_VERSION);
};
