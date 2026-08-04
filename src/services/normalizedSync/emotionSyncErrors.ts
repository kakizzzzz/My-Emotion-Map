import type { EmotionSyncErrorInfo } from './emotionOutbox';

export type NormalizedEmotionSyncErrorKind = EmotionSyncErrorInfo['kind'] |
  'setup_required' | 'upgrade_required' | 'inconsistent_read';

export class NormalizedEmotionSyncError extends Error {
  readonly kind: NormalizedEmotionSyncErrorKind;
  readonly code?: string;
  readonly status?: number;

  constructor({
    kind,
    message,
    code,
    status,
  }: {
    kind: NormalizedEmotionSyncErrorKind;
    message: string;
    code?: string;
    status?: number;
  }) {
    super(message);
    this.name = 'NormalizedEmotionSyncError';
    this.kind = kind;
    this.code = code;
    this.status = status;
  }
}

type ErrorShape = {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

const asShape = (value: unknown): ErrorShape =>
  value && typeof value === 'object' ? value as ErrorShape : {};

export const normalizeEmotionSyncError = (
  value: unknown,
): NormalizedEmotionSyncError => {
  if (value instanceof NormalizedEmotionSyncError) return value;
  const error = asShape(value);
  const code = typeof error.code === 'string' ? error.code : undefined;
  const status = typeof error.status === 'number' ? error.status : undefined;
  const message = typeof error.message === 'string' && error.message
    ? error.message
    : 'Normalized emotion sync failed.';
  const hint = typeof error.hint === 'string' ? error.hint : '';
  const details = typeof error.details === 'string' ? error.details : '';
  if (code === 'normalized_emotion_storage_not_ready' ||
    hint.includes('normalized_emotion_storage_not_ready') ||
    message.includes('not migrated or verified')) {
    return new NormalizedEmotionSyncError({
      kind: 'setup_required', code, status, message,
    });
  }
  if (status === 401 || status === 403 ||
    ['28000', '42501', 'PGRST301'].includes(code ?? '')) {
    return new NormalizedEmotionSyncError({
      kind: 'authorization', code, status, message,
    });
  }
  if (['22001', '22003', '22007', '22023', '23502', '23503', '23505']
    .includes(code ?? '')) {
    return new NormalizedEmotionSyncError({
      kind: 'validation', code, status, message,
    });
  }
  if (status === 0 || /fetch|network|offline|connection/i.test(
    `${message} ${details}`,
  )) {
    return new NormalizedEmotionSyncError({
      kind: 'network', code, status, message,
    });
  }
  return new NormalizedEmotionSyncError({
    kind: 'server', code, status, message,
  });
};

export const emotionSyncErrorInfo = (
  value: unknown,
): EmotionSyncErrorInfo => {
  const error = normalizeEmotionSyncError(value);
  return {
    kind: error.kind === 'setup_required' ||
      error.kind === 'upgrade_required' ||
      error.kind === 'inconsistent_read'
      ? 'server'
      : error.kind,
    code: error.code,
    status: error.status,
    message: error.message,
  };
};
