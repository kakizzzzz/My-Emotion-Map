import type { EmotionMutationOutbox } from './emotionOutbox';
import { MAX_EMOTION_MUTATIONS_PER_COMMIT } from './emotionSyncTypes';

export const nextEmotionMutationBatch = (
  outbox: EmotionMutationOutbox,
) => outbox.inFlightBatch?.mutations ??
  outbox.mutations.slice(0, MAX_EMOTION_MUTATIONS_PER_COMMIT);
