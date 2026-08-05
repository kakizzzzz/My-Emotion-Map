import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { AppCopy, AppLanguage } from '../i18n';
import type {
  AppDataSnapshot,
  AppView,
  Conversation,
  DataMode,
  EmotionMoment,
  EmotionNote,
  FollowUpRecord,
  MapViewport,
  RevisitRecord,
  ThemePalette,
  ThemeTone,
} from '../types';
import type { ToastHandler } from './appTypes';
import type { LoadedAppData } from './appDataRepository';
import {
  clearAllLocalData,
  canonicalSnapshotDigest,
  createEmptyAppData,
  removeMomentAssociations,
  saveAppData,
} from './appDataRepository';
import { promoteNextDueFollowUp } from '../domain/followUps';
import {
  exportReadableData,
  type DataExportRange,
} from './exportReadableData';
import { createRecordId } from './createRecordId';
import {
  createDefaultLocalSettings,
  loadLocalSettings,
  saveLocalSettings,
} from './profilePreferences';
import {
  createCompleteEmotionBackup,
  downloadCompleteEmotionBackup,
  type ParsedEmotionBackup,
} from '../domain/storage/emotionBackup';
import {
  prepareEmotionImport,
  type EmotionImportMode,
} from '../domain/storage/emotionImport';
import { normalizeEmotionSnapshot } from '../domain/storage/normalizedEmotionSnapshot';
import {
  readEmotionMutationOutbox,
  writeEmotionRecoveryBundle,
} from '../services/normalizedSync/emotionOutbox';
import {
  createEmotionRecoveryBundle,
  persistNormalizedEmotionPreferences,
} from '../services/normalizedSync/emotionSyncRuntime';
import { clearAmbientLocationState } from './useAmbientLocationAwareness';

type LocalDataControllerOptions = {
  initialData: LoadedAppData;
  userId: string | null;
  persistenceEnabled: boolean;
  moments: EmotionMoment[];
  notes: EmotionNote[];
  conversations: Conversation[];
  followUps: FollowUpRecord[];
  revisits: RevisitRecord[];
  dataMode: DataMode;
  themeTone: ThemeTone;
  themePalette: ThemePalette;
  lastViewport?: MapViewport;
  activeConversationId: string;
  language: AppLanguage;
  getDatasetRevision: () => number;
  setMoments: Dispatch<SetStateAction<EmotionMoment[]>>;
  setNotes: Dispatch<SetStateAction<EmotionNote[]>>;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setFollowUps: Dispatch<SetStateAction<FollowUpRecord[]>>;
  setRevisits: Dispatch<SetStateAction<RevisitRecord[]>>;
  setDataMode: Dispatch<SetStateAction<DataMode>>;
  setThemeTone: Dispatch<SetStateAction<ThemeTone>>;
  setThemePalette: Dispatch<SetStateAction<ThemePalette>>;
  setLastViewport: Dispatch<SetStateAction<MapViewport | undefined>>;
  setActiveConversationId: Dispatch<SetStateAction<string>>;
  setViewingMomentId: Dispatch<SetStateAction<string | null>>;
  setEditingMomentId: Dispatch<SetStateAction<string | null>>;
  setRevisitNoteId: Dispatch<SetStateAction<string | null>>;
  setActiveView: Dispatch<SetStateAction<AppView>>;
  copy: AppCopy;
  showToast: ToastHandler;
};

export function useLocalDataController({
  initialData,
  userId,
  persistenceEnabled,
  moments,
  notes,
  conversations,
  followUps,
  revisits,
  dataMode,
  themeTone,
  themePalette,
  lastViewport,
  activeConversationId,
  language,
  getDatasetRevision,
  setMoments,
  setNotes,
  setConversations,
  setFollowUps,
  setRevisits,
  setDataMode,
  setThemeTone,
  setThemePalette,
  setLastViewport,
  setActiveConversationId,
  setViewingMomentId,
  setEditingMomentId,
  setRevisitNoteId,
  setActiveView,
  copy,
  showToast,
}: LocalDataControllerOptions) {
  const hasReportedStorageFailureRef = useRef(false);
  const savedDigestRef = useRef('');
  const snapshot = useMemo<AppDataSnapshot>(
    () => ({
      schemaVersion: initialData.schemaVersion,
      dataMode,
      moments,
      notes,
      conversations,
      followUps,
      revisits,
      themeTone,
      themePalette,
      lastViewport,
      lastConversationId: conversations.some(
        (conversation) => conversation.id === activeConversationId,
      )
        ? activeConversationId
        : undefined,
    }),
    [
      conversations,
      dataMode,
      followUps,
      initialData.schemaVersion,
      moments,
      notes,
      revisits,
      themePalette,
      themeTone,
      lastViewport,
      activeConversationId,
    ],
  );
  const latestSnapshotRef = useRef(snapshot);
  const latestUserIdRef = useRef(userId);
  useLayoutEffect(() => {
    latestSnapshotRef.current = snapshot;
    latestUserIdRef.current = userId;
  }, [snapshot, userId]);

  useEffect(() => {
    if (!persistenceEnabled) return;
    const flushLatestSnapshot = () => {
      const latestSnapshot = latestSnapshotRef.current;
      const digest = canonicalSnapshotDigest(latestSnapshot);
      if (digest === savedDigestRef.current) return;
      if (saveAppData(latestSnapshot, latestUserIdRef.current)) {
        savedDigestRef.current = digest;
      }
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flushLatestSnapshot();
    };
    window.addEventListener('pagehide', flushLatestSnapshot);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('pagehide', flushLatestSnapshot);
      document.removeEventListener('visibilitychange', flushWhenHidden);
    };
  }, [persistenceEnabled]);

  useEffect(() => {
    if (!persistenceEnabled) return;
    const digest = canonicalSnapshotDigest(snapshot);
    if (digest === savedDigestRef.current) return;
    const timer = window.setTimeout(() => {
      if (saveAppData(snapshot, userId)) {
        savedDigestRef.current = digest;
        return;
      }
      if (!hasReportedStorageFailureRef.current) {
        hasReportedStorageFailureRef.current = true;
        showToast(copy.feedback.storageWriteFailed, {
          placement: 'top',
          durationMs: 5_000,
        });
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [
    copy.feedback.storageWriteFailed,
    persistenceEnabled,
    showToast,
    snapshot,
    userId,
  ]);

  useEffect(() => {
    if (initialData.loadIssue === 'corrupt-json') {
      showToast(copy.feedback.storageCorruptRecovered, {
        placement: 'top',
        durationMs: 5_000,
      });
    } else if (initialData.loadIssue === 'storage-unavailable') {
      showToast(copy.feedback.storageUnavailable, {
        placement: 'top',
        durationMs: 5_000,
      });
    }
  }, [
    copy.feedback.storageCorruptRecovered,
    copy.feedback.storageUnavailable,
    initialData.loadIssue,
    showToast,
  ]);

  const applySnapshot = useCallback(
    (
      next: AppDataSnapshot,
      { preserveTransientState = false }: {
        preserveTransientState?: boolean;
      } = {},
    ) => {
      setDataMode(next.dataMode);
      setMoments(next.moments);
      setNotes(next.notes);
      setConversations(next.conversations);
      setFollowUps(promoteNextDueFollowUp(next.followUps));
      setRevisits(next.revisits);
      setThemeTone(next.themeTone);
      setThemePalette(next.themePalette);
      setLastViewport(next.lastViewport);
      const restoredConversation =
        next.conversations.find(
          (conversation) => conversation.id === next.lastConversationId,
        ) ??
        [...next.conversations]
          .reverse()
          .find((conversation) => conversation.kind !== 'companion');
      const fallbackConversationId =
        restoredConversation?.id ?? createRecordId('conversation');
      if (preserveTransientState) {
        setActiveConversationId((current) =>
          next.conversations.some((conversation) => conversation.id === current)
            ? current
            : fallbackConversationId,
        );
        setViewingMomentId((current) =>
          current && next.moments.some((moment) => moment.id === current)
            ? current
            : null,
        );
        setEditingMomentId((current) =>
          current && next.moments.some((moment) => moment.id === current)
            ? current
            : null,
        );
        setRevisitNoteId((current) =>
          current && next.notes.some((note) => note.id === current)
            ? current
            : null,
        );
      } else {
        setActiveConversationId(fallbackConversationId);
        setViewingMomentId(null);
        setEditingMomentId(null);
        setRevisitNoteId(null);
        setActiveView('map');
      }
    },
    [
      setActiveView,
      setConversations,
      setDataMode,
      setEditingMomentId,
      setFollowUps,
      setMoments,
      setNotes,
      setRevisitNoteId,
      setRevisits,
      setThemePalette,
      setThemeTone,
      setLastViewport,
      setActiveConversationId,
      setViewingMomentId,
    ],
  );

  const deleteMoment = useCallback(
    (momentId: string) => {
      const next = removeMomentAssociations(snapshot, momentId);
      if (next === snapshot) return;
      if (persistenceEnabled) {
        const digest = canonicalSnapshotDigest(next);
        if (saveAppData(next, userId)) {
          savedDigestRef.current = digest;
        } else if (!hasReportedStorageFailureRef.current) {
          hasReportedStorageFailureRef.current = true;
          showToast(copy.feedback.storageWriteFailed, {
            placement: 'top',
            durationMs: 5_000,
          });
        }
      }
      applySnapshot(next);
    },
    [
      applySnapshot,
      copy.feedback.storageWriteFailed,
      persistenceEnabled,
      showToast,
      snapshot,
      userId,
    ],
  );

  const exportData = useCallback((range: DataExportRange) => {
    const result = exportReadableData({ snapshot, range, language });
    showToast(
      result.recordCount
        ? copy.feedback.dataExported
        : copy.settings.exportEmpty,
    );
    return result;
  }, [copy.feedback.dataExported, copy.settings.exportEmpty, language, showToast, snapshot]);

  const exportCompleteBackup = useCallback(async () => {
    if (!userId) return false;
    try {
      const normalized = normalizeEmotionSnapshot(
        snapshot,
        loadLocalSettings(userId),
      ).snapshot;
      const backup = await createCompleteEmotionBackup({
        normalized,
        datasetRevision: getDatasetRevision(),
      });
      downloadCompleteEmotionBackup(backup);
      showToast(copy.feedback.dataExported);
      return true;
    } catch {
      showToast(copy.feedback.storageWriteFailed, {
        placement: 'top',
        durationMs: 5_000,
      });
      return false;
    }
  }, [copy.feedback.dataExported, copy.feedback.storageWriteFailed,
    getDatasetRevision, showToast, snapshot, userId]);

  const importCompleteBackup = useCallback(async (
    parsed: ParsedEmotionBackup,
    mode: EmotionImportMode,
  ) => {
    if (!userId) return { ok: false, conflicts: 0 };
    const current = normalizeEmotionSnapshot(
      snapshot,
      loadLocalSettings(userId),
    ).snapshot;
    const revision = getDatasetRevision();
    try {
      const outbox = await readEmotionMutationOutbox(userId);
      if (mode === 'replace') {
        const safetyBackup = await createCompleteEmotionBackup({
          normalized: current,
          datasetRevision: revision,
        });
        downloadCompleteEmotionBackup(safetyBackup);
      }
      const prepared = prepareEmotionImport({
        current,
        incoming: parsed.normalized,
        mode,
        device: snapshot,
      });
      if (mode === 'replace' || prepared.conflicts.length) {
        await writeEmotionRecoveryBundle(createEmotionRecoveryBundle({
          userId,
          kind: mode === 'replace' ? 'import-replace' : 'conflict',
          localSnapshot: current,
          remoteSnapshot: parsed.normalized,
          outbox,
          revision,
          conflicts: prepared.conflicts,
        }));
      }
      persistNormalizedEmotionPreferences(userId, prepared.snapshot);
      applySnapshot(prepared.appSnapshot);
      showToast(copy.feedback.dataImported);
      return { ok: true, conflicts: prepared.conflicts.length };
    } catch {
      showToast(copy.feedback.dataImportFailed, {
        placement: 'top',
        durationMs: 5_000,
      });
      return { ok: false, conflicts: 0 };
    }
  }, [applySnapshot, copy.feedback.dataImportFailed,
    copy.feedback.dataImported, getDatasetRevision, showToast, snapshot, userId]);

  const deleteAllData = useCallback(async () => {
    if (!userId) return false;
    const localSettings = loadLocalSettings(userId);
    if (!clearAllLocalData(userId, dataMode)) {
      showToast(copy.feedback.storageWriteFailed, {
        placement: 'top',
        durationMs: 5_000,
      });
      return false;
    }
    clearAmbientLocationState(userId);
    saveLocalSettings({
      ...createDefaultLocalSettings(),
      avatarSrc: localSettings.avatarSrc,
      profileId: localSettings.profileId,
      language: localSettings.language,
    }, userId);
    applySnapshot(createEmptyAppData());
    showToast(copy.feedback.allDataDeleted);
    return true;
  }, [applySnapshot, copy.feedback.allDataDeleted,
    copy.feedback.storageWriteFailed, dataMode, showToast, userId]);

  return {
    applySnapshot,
    deleteMoment,
    exportData,
    exportCompleteBackup,
    importCompleteBackup,
    deleteAllData,
  };
}
