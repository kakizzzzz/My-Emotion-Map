import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { AppLanguage } from '../i18n';
import type { CloudSyncStatus } from '../services/useCloudSync';
import type { EmotionSyncErrorInfo } from '../services/normalizedSync/emotionOutbox';

const COPY: Record<AppLanguage, {
  checking: string;
  local: string;
  syncing: string;
  synced: string;
  offline: string;
  error: string;
  validation: string;
  authorization: string;
  storage: string;
  conflict: string;
  upgrade: string;
  setup: string;
  safeMerge: string;
  useRemote: string;
  keepLocal: string;
  downloadRecovery: string;
  moreOptions: string;
  lessOptions: string;
}> = {
  zh: {
    checking: '正在检查云端…',
    local: '已在本机保存',
    syncing: '正在同步云端…',
    synced: '已同步',
    offline: '网络不可用，本机副本已保留',
    error: '云端同步暂不可用，本机副本已保留',
    validation: '一项本机修改暂不能同步，本机副本已保留',
    authorization: '云端权限已失效，本机副本已保留，请重新登录',
    storage: '本机同步队列不可用，当前内容仍保留',
    conflict: '检测到另一设备更新，本机修改已保留',
    upgrade: '云端数据需要更新版本的应用',
    setup: '云端数据结构尚未完成 v2 迁移',
    safeMerge: '安全合并',
    useRemote: '载入云端',
    keepLocal: '保留本机',
    downloadRecovery: '下载恢复副本',
    moreOptions: '更多选项',
    lessOptions: '收起选项',
  },
  en: {
    checking: 'Checking cloud…',
    local: 'Saved on this device',
    syncing: 'Syncing to cloud…',
    synced: 'Synced',
    offline: 'Network unavailable. A local copy was kept.',
    error: 'Cloud sync is unavailable. A local copy was kept.',
    validation: 'One local change cannot sync yet. A local copy was kept.',
    authorization: 'Cloud access expired. Your local copy is safe; please sign in again.',
    storage: 'The on-device sync queue is unavailable. Current content was kept.',
    conflict: 'Another device changed this workspace. Local changes were kept.',
    upgrade: 'Cloud data requires a newer app version.',
    setup: 'Cloud storage has not completed the v2 migration.',
    safeMerge: 'Safe merge',
    useRemote: 'Load cloud',
    keepLocal: 'Keep this device',
    downloadRecovery: 'Download recovery',
    moreOptions: 'More options',
    lessOptions: 'Fewer options',
  },
  ko: {
    checking: '클라우드를 확인하는 중…',
    local: '기기에 저장됨',
    syncing: '클라우드에 동기화 중…',
    synced: '동기화됨',
    offline: '네트워크를 사용할 수 없어 기기 사본을 보관했습니다.',
    error: '클라우드 동기화를 사용할 수 없어 기기 사본을 보관했습니다.',
    validation: '일부 기기 변경 사항을 아직 동기화할 수 없습니다.',
    authorization: '클라우드 권한이 만료되었습니다. 다시 로그인해 주세요.',
    storage: '기기 동기화 대기열을 사용할 수 없지만 현재 내용은 보관되었습니다.',
    conflict: '다른 기기에서 변경되었습니다. 기기 변경 사항은 보관되었습니다.',
    upgrade: '클라우드 데이터에는 더 최신 앱이 필요합니다.',
    setup: '클라우드 데이터 구조의 v2 마이그레이션이 완료되지 않았습니다.',
    safeMerge: '안전하게 병합',
    useRemote: '클라우드 불러오기',
    keepLocal: '이 기기 유지',
    downloadRecovery: '복구 사본 다운로드',
    moreOptions: '다른 선택',
    lessOptions: '선택 접기',
  },
};

export function CloudSyncNotice({
  status,
  isUserOperationSync,
  errorInfo,
  language,
  onSafeMerge,
  onUseRemote,
  onKeepLocal,
  onDownloadRecovery,
}: {
  status: CloudSyncStatus;
  isUserOperationSync: boolean;
  errorInfo?: EmotionSyncErrorInfo | null;
  language: AppLanguage;
  onSafeMerge: () => void;
  onUseRemote: () => void;
  onKeepLocal: () => void;
  onDownloadRecovery: () => void;
}) {
  const [showSynced, setShowSynced] = useState(false);
  const [showConflictOptions, setShowConflictOptions] = useState(false);

  useEffect(() => {
    if (status !== 'synced' || !isUserOperationSync) {
      setShowSynced(false);
      return;
    }
    setShowSynced(true);
    const timer = window.setTimeout(() => setShowSynced(false), 900);
    return () => window.clearTimeout(timer);
  }, [isUserOperationSync, status]);

  useEffect(() => {
    if (status !== 'conflict') setShowConflictOptions(false);
  }, [status]);

  const requiresAttention =
    status === 'conflict' ||
    status === 'upgrade_required' ||
    status === 'setup_required' ||
    (status === 'error' && (
      errorInfo?.kind === 'authorization' ||
      errorInfo?.kind === 'storage'
    ));
  const chatIsOpen = typeof document !== 'undefined' &&
    Boolean(document.querySelector('.chat-screen'));
  const suppressRoutineChatSync =
    chatIsOpen &&
    isUserOperationSync &&
    (status === 'checking' ||
      status === 'local' ||
      status === 'syncing' ||
      status === 'synced');
  const visibleStatus =
    suppressRoutineChatSync
      ? null
      : !isUserOperationSync && !requiresAttention
        ? null
        : status === 'synced' && !showSynced
          ? null
          : status;
  const copy = COPY[language];
  const message =
    visibleStatus === 'checking'
      ? copy.checking
      : visibleStatus === 'local'
        ? copy.local
      : visibleStatus === 'syncing'
        ? copy.syncing
        : visibleStatus === 'synced'
          ? copy.synced
          : visibleStatus === 'offline'
            ? copy.offline
            : visibleStatus === 'error'
              ? errorInfo?.kind === 'validation'
                ? copy.validation
                : errorInfo?.kind === 'authorization'
                  ? copy.authorization
                  : errorInfo?.kind === 'storage'
                    ? copy.storage
                    : copy.error
              : visibleStatus === 'conflict'
                ? copy.conflict
                : visibleStatus === 'upgrade_required'
                  ? copy.upgrade
                  : visibleStatus === 'setup_required'
                    ? copy.setup
                    : '';

  return (
    <AnimatePresence>
      {message ? (
        <motion.div
          key={visibleStatus}
          className={`toast cloud-sync-toast ${
            visibleStatus === 'conflict'
              ? 'cloud-sync-toast--conflict'
              : ''
          }`}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.12 }}
          role={visibleStatus === 'conflict' ? 'alert' : 'status'}
          aria-live="polite"
          aria-atomic="true"
        >
          <span>{message}</span>
          {visibleStatus === 'conflict' ? (
            <span className="cloud-sync-toast__actions">
              <button
                type="button"
                className="cloud-sync-toast__primary"
                onClick={onSafeMerge}
              >
                {copy.safeMerge}
              </button>
              <button
                type="button"
                aria-expanded={showConflictOptions}
                aria-controls="cloud-sync-advanced-actions"
                onClick={() => setShowConflictOptions((value) => !value)}
              >
                {showConflictOptions ? copy.lessOptions : copy.moreOptions}
              </button>
              {showConflictOptions ? (
                <span
                  id="cloud-sync-advanced-actions"
                  className="cloud-sync-toast__advanced"
                >
                  <button type="button" onClick={onKeepLocal}>
                    {copy.keepLocal}
                  </button>
                  <button type="button" onClick={onUseRemote}>
                    {copy.useRemote}
                  </button>
                  <button type="button" onClick={onDownloadRecovery}>
                    {copy.downloadRecovery}
                  </button>
                </span>
              ) : null}
            </span>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
