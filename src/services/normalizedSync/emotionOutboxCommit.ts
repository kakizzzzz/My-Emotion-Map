import { compactEmotionMutations } from './emotionMutationModel';
import {
  EMOTION_OUTBOX_STORE_NAME,
  emotionSyncTransactionDone,
  newestEmotionOutboxForUser,
  openEmotionSyncDatabase,
  prepareEmotionOutbox,
  withEmotionInFlightBatch,
  type EmotionMutationOutbox,
  type EmotionSyncErrorInfo,
} from './emotionOutbox';
import type { EmotionMutation } from './emotionSyncTypes';

const latestOutbox = (
  stored: unknown,
  fallback: EmotionMutationOutbox,
) => newestEmotionOutboxForUser(
  stored as EmotionMutationOutbox | undefined ?? null,
  fallback,
  fallback.userId,
) ?? fallback;

export const persistEmotionInFlightBatch = async (
  outbox: EmotionMutationOutbox,
  mutations: EmotionMutation[],
) => {
  const database = await openEmotionSyncDatabase();
  let next: EmotionMutationOutbox | null = null;
  try {
    const transaction = database.transaction(EMOTION_OUTBOX_STORE_NAME, 'readwrite');
    const done = emotionSyncTransactionDone(transaction);
    const store = transaction.objectStore(EMOTION_OUTBOX_STORE_NAME);
    const request = store.get(outbox.userId);
    request.onsuccess = () => {
      try {
        next = prepareEmotionOutbox(withEmotionInFlightBatch(
          latestOutbox(request.result, outbox),
          mutations,
        ));
        store.put(next);
      } catch {
        transaction.abort();
      }
    };
    await done;
    const completed = next as EmotionMutationOutbox | null;
    if (!completed) throw new Error('Could not persist the in-flight mutation batch.');
    return completed;
  } finally {
    database.close();
  }
};

export const acknowledgeEmotionInFlightBatch = async (
  outbox: EmotionMutationOutbox,
  nextRevision: number,
) => {
  const confirmedIds = new Set(
    outbox.inFlightBatch?.mutations.map((mutation) => mutation.mutationId) ?? [],
  );
  const database = await openEmotionSyncDatabase();
  let next: EmotionMutationOutbox | null = null;
  try {
    const transaction = database.transaction(EMOTION_OUTBOX_STORE_NAME, 'readwrite');
    const done = emotionSyncTransactionDone(transaction);
    const store = transaction.objectStore(EMOTION_OUTBOX_STORE_NAME);
    const request = store.get(outbox.userId);
    request.onsuccess = () => {
      try {
        const latest = latestOutbox(request.result, outbox);
        next = prepareEmotionOutbox({
          ...latest,
          expectedRevision: nextRevision,
          mutations: latest.mutations.filter(
            (mutation) => !confirmedIds.has(mutation.mutationId),
          ),
          inFlightBatch: undefined,
          sequence: latest.sequence + 1,
          savedAt: Date.now(),
          lastError: undefined,
          lastErrorInfo: undefined,
        });
        if (next.mutations.length) store.put(next);
        else store.delete(outbox.userId);
      } catch {
        transaction.abort();
      }
    };
    await done;
    const completed = next as EmotionMutationOutbox | null;
    return completed?.mutations.length ? completed : null;
  } finally {
    database.close();
  }
};

export const replaceEmotionOutboxMutations = async ({
  outbox,
  expectedRevision,
  mutations,
  lastError,
  lastErrorInfo,
}: {
  outbox: EmotionMutationOutbox;
  expectedRevision: number;
  mutations: EmotionMutation[];
  lastError?: string;
  lastErrorInfo?: EmotionSyncErrorInfo;
}) => {
  const database = await openEmotionSyncDatabase();
  let next: EmotionMutationOutbox | null = null;
  try {
    const transaction = database.transaction(EMOTION_OUTBOX_STORE_NAME, 'readwrite');
    const done = emotionSyncTransactionDone(transaction);
    const store = transaction.objectStore(EMOTION_OUTBOX_STORE_NAME);
    const request = store.get(outbox.userId);
    request.onsuccess = () => {
      try {
        const latest = latestOutbox(request.result, outbox);
        const originalIds = new Set(outbox.mutations.map(
          (mutation) => mutation.mutationId,
        ));
        const concurrent = latest.mutations.filter(
          (mutation) => !originalIds.has(mutation.mutationId),
        );
        next = prepareEmotionOutbox({
          ...latest,
          expectedRevision,
          mutations: compactEmotionMutations([...mutations, ...concurrent]),
          inFlightBatch: undefined,
          sequence: latest.sequence + 1,
          savedAt: Date.now(),
          lastError,
          lastErrorInfo,
        });
        store.put(next);
      } catch {
        transaction.abort();
      }
    };
    await done;
    const completed = next as EmotionMutationOutbox | null;
    if (!completed) throw new Error('Could not update emotion mutations.');
    return completed;
  } finally {
    database.close();
  }
};
