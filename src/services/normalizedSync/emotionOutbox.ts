import type { LocalSyncMeta } from '../cloudSyncModel';
import {
  compactEmotionMutations,
  diffEmotionState,
} from './emotionMutationModel';
import type {
  EmotionMutation,
  NormalizedEmotionSnapshot,
} from './emotionSyncTypes';

export const EMOTION_SYNC_DB_NAME = 'my-emotion-map-sync-v2';
export const EMOTION_OUTBOX_STORE_NAME = 'emotion-mutation-outbox';
export const EMOTION_RECOVERY_STORE_NAME = 'emotion-sync-recovery';
export const EMOTION_CONVERSION_STORE_NAME = 'emotion-legacy-conversion';
const DB_VERSION = 1;

export type EmotionSyncErrorInfo = {
  kind: 'network' | 'validation' | 'authorization' | 'storage' | 'server' | 'unknown';
  code?: string;
  status?: number;
  message: string;
};

export type EmotionMutationOutbox = {
  userId: string;
  expectedRevision: number;
  mutations: EmotionMutation[];
  inFlightBatch?: {
    expectedRevision: number;
    mutations: EmotionMutation[];
    startedAt: number;
  };
  sequence: number;
  savedAt: number;
  language: string;
  lastError?: string;
  lastErrorInfo?: EmotionSyncErrorInfo;
  legacySyncConvertedAt?: number;
  legacySyncBlocked?: boolean;
};

export type EmotionRecoveryBundle = {
  id: string;
  userId: string;
  kind: 'conflict' | 'load-cloud' | 'keep-local' | 'import-replace';
  localSnapshot: NormalizedEmotionSnapshot;
  remoteSnapshot: NormalizedEmotionSnapshot;
  outbox: EmotionMutationOutbox | null;
  revision: number;
  exportedAt: string;
  conflicts?: unknown[];
};

export type LegacySyncConversionDecision =
  | 'load_remote'
  | 'enqueue_local'
  | 'already_equal'
  | 'conflict';

type LegacyConversionMarker = {
  userId: string;
  convertedAt?: number;
  blockedAt?: number;
  decision: LegacySyncConversionDecision;
  oldBaseRevision: number | null;
  oldBaseHash: string | null;
};

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(
      transaction.error ?? new Error('IndexedDB transaction failed.'),
    );
    transaction.onabort = () => reject(
      transaction.error ?? new Error('IndexedDB transaction was aborted.'),
    );
  });

const openEmotionSyncDatabase = async () => {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is unavailable.');
  }
  const request = indexedDB.open(EMOTION_SYNC_DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(EMOTION_OUTBOX_STORE_NAME)) {
      database.createObjectStore(EMOTION_OUTBOX_STORE_NAME, { keyPath: 'userId' });
    }
    if (!database.objectStoreNames.contains(EMOTION_RECOVERY_STORE_NAME)) {
      const recovery = database.createObjectStore(
        EMOTION_RECOVERY_STORE_NAME,
        { keyPath: 'id' },
      );
      recovery.createIndex('userId', 'userId', { unique: false });
    }
    if (!database.objectStoreNames.contains(EMOTION_CONVERSION_STORE_NAME)) {
      database.createObjectStore(
        EMOTION_CONVERSION_STORE_NAME,
        { keyPath: 'userId' },
      );
    }
  };
  return requestResult(request);
};

export const emotionOutboxForUser = (
  outbox: EmotionMutationOutbox | null,
  userId: string,
) => outbox?.userId === userId ? outbox : null;

export const newestEmotionOutboxForUser = (
  first: EmotionMutationOutbox | null,
  second: EmotionMutationOutbox | null,
  userId: string,
) => {
  const left = emotionOutboxForUser(first, userId);
  const right = emotionOutboxForUser(second, userId);
  if (!left) return right;
  if (!right) return left;
  if (left.sequence !== right.sequence) {
    return left.sequence > right.sequence ? left : right;
  }
  return left.savedAt >= right.savedAt ? left : right;
};

const prepareOutbox = (
  outbox: EmotionMutationOutbox,
): EmotionMutationOutbox => ({
  ...outbox,
  expectedRevision: Math.max(0, outbox.expectedRevision),
  mutations: compactEmotionMutations(outbox.mutations),
  inFlightBatch: outbox.inFlightBatch ? {
    ...outbox.inFlightBatch,
    expectedRevision: Math.max(0, outbox.inFlightBatch.expectedRevision),
    mutations: compactEmotionMutations(outbox.inFlightBatch.mutations),
  } : undefined,
  savedAt: Date.now(),
});

export const mergeEmotionOutbox = ({
  existing,
  userId,
  expectedRevision,
  mutations,
  language,
  now = Date.now(),
}: {
  existing: EmotionMutationOutbox | null;
  userId: string;
  expectedRevision: number;
  mutations: EmotionMutation[];
  language: string;
  now?: number;
}): EmotionMutationOutbox => {
  const current = emotionOutboxForUser(existing, userId);
  return {
    userId,
    expectedRevision: current?.expectedRevision ?? Math.max(0, expectedRevision),
    mutations: compactEmotionMutations([
      ...(current?.mutations ?? []),
      ...mutations,
    ]),
    inFlightBatch: current?.inFlightBatch,
    sequence: (current?.sequence ?? 0) + 1,
    savedAt: now,
    language,
    lastError: current?.lastError,
    lastErrorInfo: current?.lastErrorInfo,
    legacySyncConvertedAt: current?.legacySyncConvertedAt,
    legacySyncBlocked: current?.legacySyncBlocked,
  };
};

export const withEmotionInFlightBatch = (
  outbox: EmotionMutationOutbox,
  mutations: EmotionMutation[],
  now = Date.now(),
): EmotionMutationOutbox => ({
  ...outbox,
  inFlightBatch: {
    expectedRevision: outbox.expectedRevision,
    mutations: structuredClone(mutations),
    startedAt: now,
  },
  sequence: outbox.sequence + 1,
  savedAt: now,
});

export const readEmotionMutationOutbox = async (
  userId: string,
): Promise<EmotionMutationOutbox | null> => {
  const database = await openEmotionSyncDatabase();
  try {
    const transaction = database.transaction(EMOTION_OUTBOX_STORE_NAME, 'readonly');
    const value = await requestResult(
      transaction.objectStore(EMOTION_OUTBOX_STORE_NAME).get(userId),
    );
    return value && typeof value === 'object'
      ? emotionOutboxForUser(value as EmotionMutationOutbox, userId)
      : null;
  } finally {
    database.close();
  }
};

export const writeEmotionMutationOutbox = async (
  outbox: EmotionMutationOutbox,
) => {
  const database = await openEmotionSyncDatabase();
  try {
    const transaction = database.transaction(EMOTION_OUTBOX_STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(EMOTION_OUTBOX_STORE_NAME).put(prepareOutbox(outbox));
    await done;
  } finally {
    database.close();
  }
};

export const enqueueEmotionMutations = async ({
  userId,
  expectedRevision,
  mutations,
  language,
}: {
  userId: string;
  expectedRevision: number;
  mutations: EmotionMutation[];
  language: string;
}) => {
  if (!mutations.length) return readEmotionMutationOutbox(userId);
  const database = await openEmotionSyncDatabase();
  let next: EmotionMutationOutbox | null = null;
  try {
    const transaction = database.transaction(EMOTION_OUTBOX_STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(EMOTION_OUTBOX_STORE_NAME);
    const request = store.get(userId);
    request.onsuccess = () => {
      try {
        const existing = request.result as EmotionMutationOutbox | undefined;
        next = prepareOutbox(mergeEmotionOutbox({
          existing: existing ?? null,
          userId,
          expectedRevision,
          mutations,
          language,
        }));
        store.put(next);
      } catch {
        transaction.abort();
      }
    };
    await done;
    if (!next) throw new Error('Could not persist emotion changes.');
    return next;
  } finally {
    database.close();
  }
};

export const persistEmotionInFlightBatch = async (
  outbox: EmotionMutationOutbox,
  mutations: EmotionMutation[],
) => {
  const next = prepareOutbox(withEmotionInFlightBatch(outbox, mutations));
  await writeEmotionMutationOutbox(next);
  return next;
};

export const clearEmotionMutationOutbox = async (userId: string) => {
  const database = await openEmotionSyncDatabase();
  try {
    const transaction = database.transaction(EMOTION_OUTBOX_STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(EMOTION_OUTBOX_STORE_NAME).delete(userId);
    await done;
  } finally {
    database.close();
  }
};

export const writeEmotionRecoveryBundle = async (
  recovery: EmotionRecoveryBundle,
) => {
  if (!recovery.id || !recovery.userId || recovery.revision < 0) {
    throw new Error('Invalid emotion recovery bundle.');
  }
  const database = await openEmotionSyncDatabase();
  try {
    const transaction = database.transaction(EMOTION_RECOVERY_STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(EMOTION_RECOVERY_STORE_NAME).put(structuredClone(recovery));
    await done;
  } finally {
    database.close();
  }
};

export const discardEmotionOutboxAfterRecovery = async (
  recovery: EmotionRecoveryBundle,
) => {
  const database = await openEmotionSyncDatabase();
  try {
    const transaction = database.transaction(
      [EMOTION_RECOVERY_STORE_NAME, EMOTION_OUTBOX_STORE_NAME],
      'readwrite',
    );
    const done = transactionDone(transaction);
    transaction.objectStore(EMOTION_RECOVERY_STORE_NAME).put(
      structuredClone(recovery),
    );
    transaction.objectStore(EMOTION_OUTBOX_STORE_NAME).delete(recovery.userId);
    await done;
  } finally {
    database.close();
  }
};

export const decideLegacySyncConversion = ({
  localHash,
  remoteHash,
  meta,
  remoteIsEmpty,
  localHasValidRecords,
  legacyArchiveExists,
}: {
  localHash: string;
  remoteHash: string;
  meta: LocalSyncMeta | null;
  remoteIsEmpty: boolean;
  localHasValidRecords: boolean;
  legacyArchiveExists: boolean;
}): LegacySyncConversionDecision => {
  if (localHash === remoteHash) return 'already_equal';
  if (meta?.baseHash) {
    if (localHash === meta.baseHash) return 'load_remote';
    if (remoteHash === meta.baseHash) return 'enqueue_local';
    return 'conflict';
  }
  if (remoteIsEmpty && !legacyArchiveExists && localHasValidRecords) {
    return 'enqueue_local';
  }
  return 'conflict';
};

export const readLegacyEmotionConversion = async (userId: string) => {
  const database = await openEmotionSyncDatabase();
  try {
    const transaction = database.transaction(
      EMOTION_CONVERSION_STORE_NAME,
      'readonly',
    );
    const value = await requestResult(
      transaction.objectStore(EMOTION_CONVERSION_STORE_NAME).get(userId),
    );
    return value && typeof value === 'object'
      ? value as LegacyConversionMarker
      : null;
  } finally {
    database.close();
  }
};

export const convertLegacySyncToOutbox = async ({
  userId,
  remote,
  local,
  remoteRevision,
  localHash,
  remoteHash,
  meta,
  remoteIsEmpty,
  localHasValidRecords,
  legacyArchiveExists,
  language,
}: {
  userId: string;
  remote: NormalizedEmotionSnapshot;
  local: NormalizedEmotionSnapshot;
  remoteRevision: number;
  localHash: string;
  remoteHash: string;
  meta: LocalSyncMeta | null;
  remoteIsEmpty: boolean;
  localHasValidRecords: boolean;
  legacyArchiveExists: boolean;
  language: string;
}) => {
  const existingMarker = await readLegacyEmotionConversion(userId);
  if (existingMarker?.convertedAt || existingMarker?.blockedAt) {
    return existingMarker.decision;
  }
  const decision = decideLegacySyncConversion({
    localHash, remoteHash, meta, remoteIsEmpty, localHasValidRecords,
    legacyArchiveExists,
  });
  const database = await openEmotionSyncDatabase();
  try {
    const transaction = database.transaction(
      [EMOTION_OUTBOX_STORE_NAME, EMOTION_CONVERSION_STORE_NAME],
      'readwrite',
    );
    const done = transactionDone(transaction);
    const now = Date.now();
    const marker: LegacyConversionMarker = {
      userId,
      decision,
      oldBaseRevision: meta?.baseRevision ?? null,
      oldBaseHash: meta?.baseHash ?? null,
      ...(decision === 'conflict' ? { blockedAt: now } : { convertedAt: now }),
    };
    if (decision === 'enqueue_local') {
      const mutations = diffEmotionState(remote, local);
      const outbox = prepareOutbox({
        userId,
        expectedRevision: remoteRevision,
        mutations,
        sequence: 1,
        savedAt: now,
        language,
        legacySyncConvertedAt: now,
      });
      transaction.objectStore(EMOTION_OUTBOX_STORE_NAME).put(outbox);
    } else if (decision === 'conflict') {
      transaction.objectStore(EMOTION_OUTBOX_STORE_NAME).put(prepareOutbox({
        userId,
        expectedRevision: remoteRevision,
        mutations: [],
        sequence: 1,
        savedAt: now,
        language,
        legacySyncBlocked: true,
      }));
    }
    transaction.objectStore(EMOTION_CONVERSION_STORE_NAME).put(marker);
    await done;
    return decision;
  } finally {
    database.close();
  }
};
