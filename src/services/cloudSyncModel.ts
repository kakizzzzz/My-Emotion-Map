export type LocalSyncMeta = {
  baseRevision: number;
  baseHash: string;
  pendingRequestId: string | null;
  pendingPayloadHash: string | null;
  dirty: boolean;
  lastSyncedAt: string | null;
};

export type BootstrapSyncDecision =
  | 'synced'
  | 'use_remote'
  | 'upload_local'
  | 'conflict';

const syncMetaStorageKey = (userId: string) =>
  `my-emotion-map.sync-meta.${userId}.v1`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeSyncMeta = (value: unknown): LocalSyncMeta | null => {
  if (!isRecord(value)) return null;
  const baseRevision = Number(value.baseRevision);
  const baseHash = typeof value.baseHash === 'string' ? value.baseHash : '';
  const pendingRequestId =
    typeof value.pendingRequestId === 'string' && value.pendingRequestId
      ? value.pendingRequestId
      : null;
  const pendingPayloadHash =
    typeof value.pendingPayloadHash === 'string' && value.pendingPayloadHash
      ? value.pendingPayloadHash
      : null;
  const lastSyncedAt =
    typeof value.lastSyncedAt === 'string' && value.lastSyncedAt
      ? value.lastSyncedAt
      : null;
  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) return null;
  return {
    baseRevision,
    baseHash,
    pendingRequestId,
    pendingPayloadHash,
    dirty: value.dirty === true,
    lastSyncedAt,
  };
};

export const loadSyncMeta = (userId: string): LocalSyncMeta | null => {
  try {
    const raw = window.localStorage.getItem(syncMetaStorageKey(userId));
    return raw ? normalizeSyncMeta(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

export const saveSyncMeta = (userId: string, meta: LocalSyncMeta) => {
  try {
    window.localStorage.setItem(syncMetaStorageKey(userId), JSON.stringify(meta));
    return true;
  } catch {
    return false;
  }
};

export const clearSyncMeta = (userId: string) => {
  try {
    window.localStorage.removeItem(syncMetaStorageKey(userId));
    return true;
  } catch {
    return false;
  }
};

export const decideBootstrapSync = ({
  localHash,
  remoteHash,
  remoteRevision,
  localHasRecords,
  meta,
}: {
  localHash: string;
  remoteHash: string;
  remoteRevision: number;
  localHasRecords: boolean;
  meta: LocalSyncMeta | null;
}): BootstrapSyncDecision => {
  if (localHash === remoteHash) return 'synced';
  if (!meta?.baseHash) return localHasRecords ? 'conflict' : 'use_remote';
  if (remoteRevision < meta.baseRevision) return 'conflict';
  const localChanged = localHash !== meta.baseHash;
  const remoteChanged = remoteHash !== meta.baseHash;
  if (!localChanged && remoteChanged) return 'use_remote';
  if (localChanged && !remoteChanged) return 'upload_local';
  return 'conflict';
};

export const classifyBroadcast = ({
  localHash,
  incomingHash,
  meta,
}: {
  localHash: string;
  incomingHash: string;
  meta: LocalSyncMeta | null;
}): 'ignore' | 'fetch_remote' | 'conflict' => {
  if (incomingHash === localHash) return 'ignore';
  if (
    !meta ||
    meta.dirty ||
    Boolean(meta.pendingRequestId) ||
    localHash !== meta.baseHash
  ) {
    return 'conflict';
  }
  return 'fetch_remote';
};

const emptyMeta = (): LocalSyncMeta => ({
  baseRevision: 0,
  baseHash: '',
  pendingRequestId: null,
  pendingPayloadHash: null,
  dirty: false,
  lastSyncedAt: null,
});

export const createUploadIntent = (
  meta: LocalSyncMeta | null,
  payloadHash: string,
  createRequestId: () => string,
) => {
  const current = meta ?? emptyMeta();
  if (
    current.pendingRequestId &&
    current.pendingPayloadHash === payloadHash
  ) {
    return { requestId: current.pendingRequestId, meta: current };
  }
  const requestId = createRequestId();
  return {
    requestId,
    meta: {
      ...current,
      pendingRequestId: requestId,
      pendingPayloadHash: payloadHash,
      dirty: true,
    },
  };
};

export const markSyncComplete = ({
  revision,
  payloadHash,
  now = new Date().toISOString(),
}: {
  revision: number;
  payloadHash: string;
  now?: string;
}): LocalSyncMeta => ({
  baseRevision: revision,
  baseHash: payloadHash,
  pendingRequestId: null,
  pendingPayloadHash: null,
  dirty: false,
  lastSyncedAt: now,
});
