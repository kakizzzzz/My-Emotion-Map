import {
  useCallback,
  useEffect,
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
  StarInboxItem,
  ThemePalette,
  ThemeTone,
} from '../types';
import type { ToastHandler } from './appTypes';
import type { LoadedAppData } from './appDataRepository';
import {
  clearAllLocalData,
  canonicalSnapshotDigest,
  createEmptyAppData,
  parseImportedAppData,
  removeMomentAssociations,
  saveAppData,
} from './appDataRepository';
import { promoteNextDueFollowUp } from '../domain/followUps';
import {
  exportReadableData,
  type DataExportRange,
} from './exportReadableData';
import { createRecordId } from './createRecordId';

type LocalDataControllerOptions = {
  initialData: LoadedAppData;
  userId: string | null;
  persistenceEnabled: boolean;
  moments: EmotionMoment[];
  notes: EmotionNote[];
  conversations: Conversation[];
  followUps: FollowUpRecord[];
  revisits: RevisitRecord[];
  starInboxItems: StarInboxItem[];
  dataMode: DataMode;
  themeTone: ThemeTone;
  themePalette: ThemePalette;
  lastViewport?: MapViewport;
  activeConversationId: string;
  language: AppLanguage;
  setMoments: Dispatch<SetStateAction<EmotionMoment[]>>;
  setNotes: Dispatch<SetStateAction<EmotionNote[]>>;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setFollowUps: Dispatch<SetStateAction<FollowUpRecord[]>>;
  setRevisits: Dispatch<SetStateAction<RevisitRecord[]>>;
  setStarInboxItems: Dispatch<SetStateAction<StarInboxItem[]>>;
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
  starInboxItems,
  dataMode,
  themeTone,
  themePalette,
  lastViewport,
  activeConversationId,
  language,
  setMoments,
  setNotes,
  setConversations,
  setFollowUps,
  setRevisits,
  setStarInboxItems,
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
      starInboxItems,
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
      starInboxItems,
      themePalette,
      themeTone,
      lastViewport,
      activeConversationId,
    ],
  );

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
    (next: AppDataSnapshot) => {
      setDataMode(next.dataMode);
      setMoments(next.moments);
      setNotes(next.notes);
      setConversations(next.conversations);
      setFollowUps(promoteNextDueFollowUp(next.followUps));
      setRevisits(next.revisits);
      setStarInboxItems(next.starInboxItems);
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
      setActiveConversationId(
        restoredConversation?.id ?? createRecordId('conversation'),
      );
      setViewingMomentId(null);
      setEditingMomentId(null);
      setRevisitNoteId(null);
      setActiveView('map');
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
      setStarInboxItems,
      setThemePalette,
      setThemeTone,
      setLastViewport,
      setActiveConversationId,
      setViewingMomentId,
    ],
  );

  const deleteMoment = useCallback(
    (momentId: string) => {
      if (!window.confirm(copy.feedback.deleteStarConfirm)) return;
      const previous = snapshot;
      applySnapshot(removeMomentAssociations(previous, momentId));
      showToast(copy.feedback.starDeleted, {
        durationMs: 6_000,
        actionLabel: copy.common.undo,
        onAction: () => applySnapshot(previous),
      });
    },
    [applySnapshot, copy, showToast, snapshot],
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

  const importData = useCallback(
    async (file: File) => {
      const parsed = parseImportedAppData(await file.text());
      if (!parsed.ok) {
        showToast(
          parsed.issue === 'upgrade-required'
            ? copy.feedback.dataUpgradeRequired
            : copy.feedback.dataImportFailed,
          {
            placement: 'top',
            durationMs: 4_000,
          },
        );
        return;
      }
      const preview = String(parsed.snapshot.notes.length);
      if (!window.confirm(preview)) return;
      applySnapshot(parsed.snapshot);
      showToast(copy.feedback.dataImported);
    },
    [applySnapshot, copy.feedback, showToast],
  );

  const deleteAllData = useCallback(() => {
    if (!window.confirm(copy.feedback.deleteAllDataConfirm)) return;
    if (!clearAllLocalData(userId, dataMode)) {
      showToast(copy.feedback.storageWriteFailed, {
        placement: 'top',
        durationMs: 5_000,
      });
    }
    applySnapshot(createEmptyAppData());
    showToast(copy.feedback.allDataDeleted);
  }, [applySnapshot, copy.feedback, dataMode, showToast, userId]);

  return {
    applySnapshot,
    deleteMoment,
    exportData,
    importData,
    deleteAllData,
  };
}
