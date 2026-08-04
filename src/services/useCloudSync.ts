// Compatibility entry point. The runtime implementation lives in normalizedSync.
export {
  useNormalizedCloudSync as useCloudSync,
  type CloudSyncStatus,
} from './normalizedSync/useNormalizedCloudSync';
