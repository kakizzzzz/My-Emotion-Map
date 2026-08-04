import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { AppLanguage } from '../i18n';
import type { CloudSyncStatus } from '../services/useCloudSync';

const COPY: Record<AppLanguage, {
  checking: string;
  syncing: string;
  synced: string;
  offline: string;
  error: string;
  conflict: string;
  upgrade: string;
  confirm: string;
  useRemote: string;
  keepLocal: string;
}> = {
  zh: {
    checking: '正在检查云端…',
    syncing: '正在同步云端…',
    synced: '已同步',
    offline: '网络不可用，本机副本已保留',
    error: '云端同步失败，本机副本已保留',
    conflict: '检测到另一台设备的更新，请选择保留版本',
    upgrade: '云端数据需要更新版本的应用',
    confirm: '本机数据等待同步确认',
    useRemote: '载入云端',
    keepLocal: '保留本机',
  },
  en: {
    checking: 'Checking cloud…',
    syncing: 'Syncing to cloud…',
    synced: 'Synced',
    offline: 'Network unavailable. A local copy was kept.',
    error: 'Cloud sync failed. A local copy was kept.',
    conflict: 'Another device changed this workspace. Choose which copy to keep.',
    upgrade: 'Cloud data requires a newer app version.',
    confirm: 'Local data is waiting for sync confirmation.',
    useRemote: 'Load cloud',
    keepLocal: 'Keep this device',
  },
  ko: {
    checking: '클라우드를 확인하는 중…',
    syncing: '클라우드에 동기화 중…',
    synced: '동기화됨',
    offline: '네트워크를 사용할 수 없어 기기 사본을 보관했습니다.',
    error: '클라우드 동기화에 실패해 기기 사본을 보관했습니다.',
    conflict: '다른 기기에서 변경되었습니다. 보관할 사본을 선택하세요.',
    upgrade: '클라우드 데이터에는 더 최신 앱이 필요합니다.',
    confirm: '기기 데이터가 동기화 확인을 기다리고 있습니다.',
    useRemote: '클라우드 불러오기',
    keepLocal: '이 기기 유지',
  },
};

export function CloudSyncNotice({
  status,
  language,
  onUseRemote,
  onKeepLocal,
}: {
  status: CloudSyncStatus;
  language: AppLanguage;
  onUseRemote: () => void;
  onKeepLocal: () => void;
}) {
  const [showSynced, setShowSynced] = useState(false);

  useEffect(() => {
    if (status !== 'synced') {
      setShowSynced(false);
      return;
    }
    setShowSynced(true);
    const timer = window.setTimeout(() => setShowSynced(false), 900);
    return () => window.clearTimeout(timer);
  }, [status]);

  const visibleStatus =
    status === 'synced' && !showSynced ? null : status;
  const copy = COPY[language];
  const message =
    visibleStatus === 'checking'
      ? copy.checking
      : visibleStatus === 'syncing'
        ? copy.syncing
        : visibleStatus === 'synced'
          ? copy.synced
          : visibleStatus === 'offline'
            ? copy.offline
            : visibleStatus === 'error'
              ? copy.error
              : visibleStatus === 'conflict'
                ? copy.conflict
                : visibleStatus === 'upgrade_required'
                  ? copy.upgrade
                  : visibleStatus === 'upload_confirmation_required'
                    ? copy.confirm
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
              <button type="button" onClick={onUseRemote}>
                {copy.useRemote}
              </button>
              <button type="button" onClick={onKeepLocal}>
                {copy.keepLocal}
              </button>
            </span>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
