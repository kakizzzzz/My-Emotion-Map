import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { AppCopy } from '../i18n';
import type {
  AppDataSnapshot,
  AppView,
  Conversation,
  DataMode,
  EmotionMoment,
  EmotionNote,
  FollowUpRecord,
  RevisitRecord,
  StarInboxItem,
  ThemePalette,
  ThemeTone,
} from '../types';
import type { ToastHandler } from './appTypes';
import type { LoadedAppData } from './appDataRepository';
import {
  clearAllLocalData,
  createDemoAppData,
  createEmptyAppData,
  parseImportedAppData,
  removeMomentAssociations,
  saveAppData,
  serializeAppData,
} from './appDataRepository';
import { promoteNextDueFollowUp } from '../domain/followUps';

type LocalDataControllerOptions = {
  initialData: LoadedAppData;
  moments: EmotionMoment[];
  notes: EmotionNote[];
  conversations: Conversation[];
  followUps: FollowUpRecord[];
  revisits: RevisitRecord[];
  starInboxItems: StarInboxItem[];
  dataMode: DataMode;
  themeTone: ThemeTone;
  themePalette: ThemePalette;
  setMoments: Dispatch<SetStateAction<EmotionMoment[]>>;
  setNotes: Dispatch<SetStateAction<EmotionNote[]>>;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setFollowUps: Dispatch<SetStateAction<FollowUpRecord[]>>;
  setRevisits: Dispatch<SetStateAction<RevisitRecord[]>>;
  setStarInboxItems: Dispatch<SetStateAction<StarInboxItem[]>>;
  setDataMode: Dispatch<SetStateAction<DataMode>>;
  setThemeTone: Dispatch<SetStateAction<ThemeTone>>;
  setThemePalette: Dispatch<SetStateAction<ThemePalette>>;
  setViewingMomentId: Dispatch<SetStateAction<string | null>>;
  setEditingMomentId: Dispatch<SetStateAction<string | null>>;
  setRevisitNoteId: Dispatch<SetStateAction<string | null>>;
  setActiveView: Dispatch<SetStateAction<AppView>>;
  copy: AppCopy;
  showToast: ToastHandler;
};

export function useLocalDataController({
  initialData,
  moments,
  notes,
  conversations,
  followUps,
  revisits,
  starInboxItems,
  dataMode,
  themeTone,
  themePalette,
  setMoments,
  setNotes,
  setConversations,
  setFollowUps,
  setRevisits,
  setStarInboxItems,
  setDataMode,
  setThemeTone,
  setThemePalette,
  setViewingMomentId,
  setEditingMomentId,
  setRevisitNoteId,
  setActiveView,
  copy,
  showToast,
}: LocalDataControllerOptions) {
  const hasReportedStorageFailureRef = useRef(false);
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
    ],
  );

  useEffect(() => {
    if (
      !saveAppData(snapshot) &&
      !hasReportedStorageFailureRef.current
    ) {
      hasReportedStorageFailureRef.current = true;
      showToast(copy.feedback.storageWriteFailed, {
        placement: 'top',
        durationMs: 5_000,
      });
    }
  }, [copy.feedback.storageWriteFailed, showToast, snapshot]);

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

  const exportData = useCallback(() => {
    const blob = new Blob([serializeAppData(snapshot)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `my-emotion-map-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(copy.feedback.dataExported);
  }, [copy.feedback.dataExported, showToast, snapshot]);

  const importData = useCallback(
    async (file: File) => {
      const parsed = parseImportedAppData(await file.text());
      if (!parsed.ok) {
        showToast(copy.feedback.dataImportFailed, {
          placement: 'top',
          durationMs: 4_000,
        });
        return;
      }
      applySnapshot(parsed.snapshot);
      showToast(copy.feedback.dataImported);
    },
    [applySnapshot, copy.feedback, showToast],
  );

  const deleteAllData = useCallback(() => {
    if (!window.confirm(copy.feedback.deleteAllDataConfirm)) return;
    if (!clearAllLocalData()) {
      showToast(copy.feedback.storageWriteFailed, {
        placement: 'top',
        durationMs: 5_000,
      });
    }
    applySnapshot(createEmptyAppData());
    showToast(copy.feedback.allDataDeleted);
  }, [applySnapshot, copy.feedback, showToast]);

  const loadDemoMode = useCallback(() => {
    if (
      snapshot.dataMode === 'real' &&
      (snapshot.moments.length > 0 || snapshot.notes.length > 0) &&
      !window.confirm(copy.feedback.loadDemoConfirm)
    ) {
      return false;
    }
    applySnapshot(createDemoAppData());
    showToast(copy.feedback.demoLoaded);
    return true;
  }, [applySnapshot, copy.feedback, showToast, snapshot]);

  const exitDemoMode = useCallback(() => {
    if (!window.confirm(copy.feedback.exitDemoConfirm)) return false;
    applySnapshot(createEmptyAppData());
    showToast(copy.feedback.demoExited);
    return true;
  }, [applySnapshot, copy.feedback, showToast]);

  return {
    applySnapshot,
    deleteMoment,
    exportData,
    importData,
    deleteAllData,
    loadDemoMode,
    exitDemoMode,
  };
}
