import { stableSerialize } from '../../app/workspace/workspaceStorage';
import { validateEmotionMutations } from '../../services/normalizedSync/emotionMutationValidation';
import { diffEmotionState, emotionValuesEqual } from '../../services/normalizedSync/emotionMutationModel';
import {
  NORMALIZED_EMOTION_APP_SCHEMA_VERSION,
  NORMALIZED_EMOTION_MODEL_VERSION,
  type EmotionPreferencesEntity,
  type NormalizedEmotionSnapshot,
} from '../../services/normalizedSync/emotionSyncTypes';
import { DEFAULT_THEME } from '../../app/themePreferences';
import { createDefaultLocalSettings } from '../../app/profilePreferences';
import { createEmptyAppData, migrateAppData } from '../../app/appDataRepository';
import {
  assembleNormalizedEmotionSnapshot,
  normalizeEmotionSnapshot,
} from './normalizedEmotionSnapshot';

export const EMOTION_BACKUP_VERSION = 1;

export type CompleteEmotionBackupPayload = {
  backupVersion: number;
  appSchemaVersion: number;
  normalizedDataModelVersion: number;
  exportedAt: string;
  datasetRevision: number;
  records: NormalizedEmotionSnapshot['records'];
  conversations: NormalizedEmotionSnapshot['conversations'];
  messages: NormalizedEmotionSnapshot['messages'];
  followUps: NormalizedEmotionSnapshot['followUps'];
  revisits: NormalizedEmotionSnapshot['revisits'];
  theme: {
    tone: NormalizedEmotionSnapshot['settings']['themeTone'];
    palette: NormalizedEmotionSnapshot['settings']['themePalette'];
  };
  accountPreferences: EmotionPreferencesEntity;
};

export type CompleteEmotionBackup = CompleteEmotionBackupPayload & {
  checksum: string;
};

export type EmotionBackupPreview = {
  records: number;
  conversations: number;
  messages: number;
  followUps: number;
  revisits: number;
};

export type ParsedEmotionBackup = {
  backup: CompleteEmotionBackup;
  normalized: NormalizedEmotionSnapshot;
  preview: EmotionBackupPreview;
};

export type EmotionBackupParseResult =
  | { ok: true; value: ParsedEmotionBackup }
  | {
      ok: false;
      issue: 'invalid-json' | 'invalid-format' | 'checksum-mismatch' | 'future-version';
    };

const sha256 = async (value: string) => {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const backupPayload = (backup: CompleteEmotionBackup): CompleteEmotionBackupPayload => {
  const { checksum: _checksum, ...payload } = backup;
  return payload;
};

export const emotionBackupChecksum = (payload: CompleteEmotionBackupPayload) =>
  sha256(stableSerialize(payload));

export const createCompleteEmotionBackup = async ({
  normalized,
  datasetRevision,
  exportedAt = new Date().toISOString(),
}: {
  normalized: NormalizedEmotionSnapshot;
  datasetRevision: number;
  exportedAt?: string;
}): Promise<CompleteEmotionBackup> => {
  const payload: CompleteEmotionBackupPayload = {
    backupVersion: EMOTION_BACKUP_VERSION,
    appSchemaVersion: NORMALIZED_EMOTION_APP_SCHEMA_VERSION,
    normalizedDataModelVersion: NORMALIZED_EMOTION_MODEL_VERSION,
    exportedAt,
    datasetRevision: Math.max(0, Math.trunc(datasetRevision)),
    records: structuredClone(normalized.records),
    conversations: structuredClone(normalized.conversations),
    messages: structuredClone(normalized.messages),
    followUps: structuredClone(normalized.followUps),
    revisits: structuredClone(normalized.revisits),
    theme: {
      tone: normalized.settings.themeTone,
      palette: structuredClone(normalized.settings.themePalette),
    },
    accountPreferences: structuredClone(normalized.preferences),
  };
  return { ...payload, checksum: await emotionBackupChecksum(payload) };
};

const emptyNormalizedSnapshot = () => normalizeEmotionSnapshot(
  {
    ...createEmptyAppData(),
    themePalette: structuredClone(DEFAULT_THEME),
  },
  createDefaultLocalSettings(),
).snapshot;

const ensureUnique = (values: unknown[], key: (value: Record<string, unknown>) => string) => {
  const seen = new Set<string>();
  values.forEach((value) => {
    if (!isObject(value)) throw new Error('Invalid backup entity.');
    const id = key(value);
    if (!id || seen.has(id)) throw new Error('Duplicate or missing backup entity ID.');
    seen.add(id);
  });
  return seen;
};

const validateReferences = (snapshot: NormalizedEmotionSnapshot) => {
  const momentIds = ensureUnique(snapshot.records, (value) => String(value.momentId ?? ''));
  const noteIds = ensureUnique(snapshot.records, (value) => String(value.noteId ?? ''));
  if (momentIds.size !== noteIds.size) throw new Error('Record IDs do not form one-to-one pairs.');
  const conversationIds = ensureUnique(snapshot.conversations, (value) => String(value.id ?? ''));
  ensureUnique(snapshot.messages, (value) =>
    `${String(value.conversationId ?? '')}/${String(value.id ?? '')}`,
  );
  ensureUnique(snapshot.followUps, (value) => String(value.id ?? ''));
  ensureUnique(snapshot.revisits, (value) => String(value.id ?? ''));
  snapshot.messages.forEach((message) => {
    if (!conversationIds.has(message.conversationId)) {
      throw new Error('Message references a missing conversation.');
    }
  });
  snapshot.followUps.forEach((followUp) => {
    if (!noteIds.has(followUp.noteId)) throw new Error('Follow-up references a missing record.');
  });
  const followUpIds = new Set(snapshot.followUps.map((followUp) => followUp.id));
  snapshot.revisits.forEach((revisit) => {
    if (!noteIds.has(revisit.noteId) ||
      (revisit.sourceFollowUpId && !followUpIds.has(revisit.sourceFollowUpId))) {
      throw new Error('Revisit references a missing record or follow-up.');
    }
  });
};

const parsePayload = (source: Record<string, unknown>): ParsedEmotionBackup => {
  if (!Number.isSafeInteger(source.backupVersion) ||
    !Number.isSafeInteger(source.appSchemaVersion) ||
    !Number.isSafeInteger(source.normalizedDataModelVersion) ||
    !Number.isSafeInteger(source.datasetRevision) || Number(source.datasetRevision) < 0 ||
    typeof source.exportedAt !== 'string' ||
    Number.isNaN(new Date(source.exportedAt).getTime()) ||
    typeof source.checksum !== 'string' || !/^[0-9a-f]{64}$/i.test(source.checksum) ||
    !Array.isArray(source.records) || !Array.isArray(source.conversations) ||
    !Array.isArray(source.messages) || !Array.isArray(source.followUps) ||
    !Array.isArray(source.revisits) || !isObject(source.theme) ||
    !isObject(source.accountPreferences)) {
    throw new Error('Invalid backup envelope.');
  }
  const normalized: NormalizedEmotionSnapshot = {
    settings: {
      schemaVersion: Number(source.appSchemaVersion),
      themeTone: source.theme.tone as NormalizedEmotionSnapshot['settings']['themeTone'],
      themePalette: source.theme.palette as NormalizedEmotionSnapshot['settings']['themePalette'],
    },
    preferences: structuredClone(source.accountPreferences) as EmotionPreferencesEntity,
    records: structuredClone(source.records) as NormalizedEmotionSnapshot['records'],
    conversations: structuredClone(source.conversations) as NormalizedEmotionSnapshot['conversations'],
    messages: structuredClone(source.messages) as NormalizedEmotionSnapshot['messages'],
    followUps: structuredClone(source.followUps) as NormalizedEmotionSnapshot['followUps'],
    revisits: structuredClone(source.revisits) as NormalizedEmotionSnapshot['revisits'],
  };
  validateEmotionMutations(diffEmotionState(emptyNormalizedSnapshot(), normalized));
  validateReferences(normalized);
  const migrated = migrateAppData(assembleNormalizedEmotionSnapshot(normalized));
  if (migrated.status !== 'ok') throw new Error('Backup entities are not canonical.');
  const canonical = normalizeEmotionSnapshot(migrated.snapshot, {
    ...createDefaultLocalSettings(),
    ...normalized.preferences,
  }).snapshot;
  if (!emotionValuesEqual(canonical, normalized)) {
    throw new Error('Backup contains unknown or non-canonical fields.');
  }
  const backup = structuredClone(source) as CompleteEmotionBackup;
  return {
    backup,
    normalized,
    preview: {
      records: normalized.records.length,
      conversations: normalized.conversations.length,
      messages: normalized.messages.length,
      followUps: normalized.followUps.length,
      revisits: normalized.revisits.length,
    },
  };
};

export const parseCompleteEmotionBackup = async (
  text: string,
): Promise<EmotionBackupParseResult> => {
  let source: Record<string, unknown>;
  try {
    const parsed = JSON.parse(text);
    if (!isObject(parsed)) return { ok: false, issue: 'invalid-format' };
    source = parsed;
  } catch {
    return { ok: false, issue: 'invalid-json' };
  }
  if (Number(source.backupVersion) > EMOTION_BACKUP_VERSION ||
    Number(source.appSchemaVersion) > NORMALIZED_EMOTION_APP_SCHEMA_VERSION ||
    Number(source.normalizedDataModelVersion) > NORMALIZED_EMOTION_MODEL_VERSION) {
    return { ok: false, issue: 'future-version' };
  }
  try {
    const parsed = parsePayload(source);
    const expected = await emotionBackupChecksum(backupPayload(parsed.backup));
    if (expected !== parsed.backup.checksum) {
      return { ok: false, issue: 'checksum-mismatch' };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, issue: 'invalid-format' };
  }
};

export const serializeCompleteEmotionBackup = (backup: CompleteEmotionBackup) =>
  JSON.stringify(backup, null, 2);

export const downloadCompleteEmotionBackup = (backup: CompleteEmotionBackup) => {
  const blob = new Blob([serializeCompleteEmotionBackup(backup)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `my-emotion-map-backup-${backup.exportedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

export const backupsContainSameData = (
  left: CompleteEmotionBackup,
  right: CompleteEmotionBackup,
) => emotionValuesEqual(backupPayload(left), backupPayload(right));
