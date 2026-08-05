import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import 'maplibre-gl/dist/maplibre-gl.css';
import { CONTENT_FADE } from "./motion";
import { AppLanguageContext, LANGUAGE_HTML_LANGS, LANGUAGE_SPEECH_LOCALES, getAppCopy, getLanguageLocale, type AppLanguage } from "./i18n";
import { useLocationController } from "./useLocationController";
import type {
  AppView,
  Conversation,
  EmotionKey,
  EmotionMoment,
  EmotionNote,
  FollowUpRecord,
  MapViewport,
  RevisitRecord,
  ThemePalette,
  ThemeTone,
} from "./types";
import {
  createEmptyAppData,
  getWorkspaceStorageKey,
  loadAppData,
  setRevisitCurrentEmotion,
} from './app/appDataRepository';
import {
  ACCOUNT_PREFERENCES_CHANGED_EVENT,
  loadLocalSettings,
  saveLocalSettings,
} from './app/profilePreferences';
import {
  THEME_PRESETS,
  getThemeStyle,
} from './app/themePreferences';
import type { ToastNotice, ToastHandler } from './app/appTypes';
import { AppToast } from './app/AppToast';
import { CloudSyncNotice } from './app/CloudSyncNotice';
import { useFollowUpCoordinator } from './app/useFollowUpCoordinator';
import { useLocalDataController } from './app/useLocalDataController';
import {
  FOLLOW_UP_CONVERSATION_ID,
  isInboxFollowUp,
} from './domain/followUps';
import { GlobalInboxButton, GlobalMenuButton, SideDrawer } from './app/AppChrome';
import { LocationPermissionPrompt } from './features/location/LocationPermissionPrompt';
import { MapScreen } from './features/map/MapScreen';
import { NoteEditorSheet } from './features/notes/NoteEditorSheet';
import { NoteViewSheet } from './features/notes/NoteViewSheet';
import {
  retryPendingNoteImageDeletions,
  scheduleReplacedNoteImageDeletion,
} from './services/noteImageStorage';
import { RevisitEmotionModal } from './features/notes/RevisitEmotionModal';
import { useSupabaseSession } from './services/useSupabaseSession';
import type { PhotoAssistDelivery } from './app/appTypes';
import { useCloudSync } from './services/useCloudSync';
import { prepareCloudSnapshot } from './services/cloudSnapshot';
import { createRecordId } from './app/createRecordId';
import { LoginScreen } from './features/auth/LoginScreen';
import { authenticateAccount } from './services/accountAuth';
import { createExternalAccessHandlers } from './services/externalAccess';
import { completePendingProposalApplications } from './services/proposalApplication';
import {
  chatWorkspaceKey,
  clearChatDraftsForUser,
} from './app/workspace/chatDraftStorage';
import { useNoteEditorHandlers } from './app/noteEditorHandlers';
import { useChatDeliveryHandlers } from './app/useChatDeliveryHandlers';
import { useAmbientLocationAwareness, type AmbientLocationPrompt } from './app/useAmbientLocationAwareness';

const CalendarScreen = lazy(() =>
  import('./features/calendar/CalendarScreen').then((module) => ({
    default: module.CalendarScreen,
  })),
);
const ChatScreen = lazy(() =>
  import('./features/chat/ChatScreen').then((module) => ({ default: module.ChatScreen })),
);
const SettingsScreen = lazy(() =>
  import('./features/settings/SettingsScreen').then((module) => ({
    default: module.SettingsScreen,
  })),
);
const StarInboxScreen = lazy(() =>
  import('./features/inbox/StarInboxScreen').then((module) => ({
    default: module.StarInboxScreen,
  })),
);

export function App() {
  const initialData = useMemo(() => createEmptyAppData(), []);
  const initialLocalSettings = useMemo(() => loadLocalSettings(), []);
  const [activeView, setActiveView] = useState<AppView>('map');
  const [language, setLanguage] = useState<AppLanguage>(
    initialLocalSettings.language,
  );
  const [followUpIntervals, setFollowUpIntervals] = useState(
    initialLocalSettings.followUpIntervals,
  );
  const copy = getAppCopy(language);
  const languageLocale = getLanguageLocale(language);
  const languageContextValue = useMemo(
    () => ({
      language,
      copy,
      locale: languageLocale,
      speechLocale: LANGUAGE_SPEECH_LOCALES[language],
      setLanguage,
    }),
    [copy, language, languageLocale],
  );
  const cloudSession = useSupabaseSession();
  useEffect(() => {
    const userId = cloudSession.session?.user.id;
    if (!userId) return;
    const applyAccountPreferences = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId !== userId) return;
      const next = loadLocalSettings(userId);
      setLanguage(next.language);
      setFollowUpIntervals(next.followUpIntervals);
    };
    window.addEventListener(
      ACCOUNT_PREFERENCES_CHANGED_EVENT,
      applyAccountPreferences,
    );
    return () => window.removeEventListener(
      ACCOUNT_PREFERENCES_CHANGED_EVENT,
      applyAccountPreferences,
    );
  }, [cloudSession.session?.user.id]);
  const locationController = useLocationController({
    isMapActive: activeView === 'map',
    isEnabled: Boolean(cloudSession.session),
  });
  const userLocation = locationController.userLocation;
  const openLocationRequest = locationController.openLocationRequest;
  const [sideOpen, setSideOpen] = useState(false);
  const [starInboxOpen, setStarInboxOpen] = useState(false);
  const [moments, setMoments] = useState<EmotionMoment[]>(initialData.moments);
  const [notes, setNotes] = useState<EmotionNote[]>(initialData.notes);
  const [conversations, setConversations] = useState<Conversation[]>(
    initialData.conversations,
  );
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>(
    initialData.followUps,
  );
  const [revisits, setRevisits] = useState<RevisitRecord[]>(
    initialData.revisits,
  );
  const [dataMode, setDataMode] = useState(initialData.dataMode);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceUpgradeRequired, setWorkspaceUpgradeRequired] =
    useState(false);
  const activeWorkspaceUserRef = useRef<string | null>(null);
  const [mapFocusMomentId, setMapFocusMomentId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState(
    FOLLOW_UP_CONVERSATION_ID,
  );
  const [viewingMomentId, setViewingMomentId] = useState<string | null>(null);
  const [editingMomentId, setEditingMomentId] = useState<string | null>(null);
  const [revisitNoteId, setRevisitNoteId] = useState<string | null>(null);
  const [revisitFollowUpId, setRevisitFollowUpId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [photoAssistByMomentId, setPhotoAssistByMomentId] = useState<
    Record<string, PhotoAssistDelivery>
  >({});
  const toastSequenceRef = useRef(0);
  const cloudDatasetRevisionRef = useRef(0);
  const [themeTone, setThemeTone] = useState<ThemeTone>(initialData.themeTone);
  const [themePalette, setThemePalette] = useState<ThemePalette>(
    initialData.themePalette,
  );
  const [lastViewport, setLastViewport] = useState<MapViewport | undefined>(
    initialData.lastViewport,
  );

  const editingMoment = moments.find((moment) => moment.id === editingMomentId) ?? null;
  const editingNote = editingMoment
    ? notes.find((note) => note.id === editingMoment.noteId) ?? null
    : null;
  const viewingMoment = moments.find((moment) => moment.id === viewingMomentId) ?? null;
  const viewingNote = viewingMoment
    ? notes.find((note) => note.id === viewingMoment.noteId) ?? null
    : null;
  const revisitNote = notes.find((note) => note.id === revisitNoteId) ?? null;
  const savedNotes = useMemo(() => notes.filter((note) => !note.isDraft), [notes]);
  const { answerFollowUp } = useFollowUpCoordinator({
    followUps,
    setFollowUps,
    setConversations,
    setRevisits,
    notes,
    activeView,
    activeConversationId,
    language,
    navigationCopy: copy.navigation,
  });
  const unreadStarInboxCount = followUps.filter(
    (record) => isInboxFollowUp(record) && !record.seenAt,
  ).length;
  const themeStyle = getThemeStyle(themePalette);
  const chatWorkspace = chatWorkspaceKey(
    cloudSession.session?.user.id ?? null,
    dataMode,
  );

  const applyThemePreset = (tone: ThemeTone) => {
    const preset = THEME_PRESETS.find((item) => item.key === tone) ?? THEME_PRESETS[0];
    setThemeTone(tone);
    setThemePalette(preset.colors);
  };

  const showToast = useCallback<ToastHandler>((message, options = {}) => {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) return;
    toastSequenceRef.current += 1;
    setToast({
      id: toastSequenceRef.current,
      message: normalizedMessage,
      placement: options.placement ?? 'bottom',
      durationMs: options.durationMs ?? 1800,
      actionLabel: options.actionLabel,
      onAction: options.onAction,
    });
  }, []);
  const handleAmbientLocationPrompt = useCallback((prompt: AmbientLocationPrompt) => {
    showToast(copy.location.nearbyPastStars(prompt.count), {
      placement: 'top',
      durationMs: 6_500,
      actionLabel: copy.location.viewNearbyStar,
      onAction: () => {
        setActiveView('map');
        setMapFocusMomentId(prompt.primaryMomentId);
        setViewingMomentId(prompt.primaryMomentId);
      },
    });
  }, [copy.location, showToast]);
  useAmbientLocationAwareness({
    userId: cloudSession.session?.user.id ?? null,
    enabled: Boolean(
      cloudSession.session?.user.id && workspaceReady && dataMode === 'real' &&
      activeView === 'map' && !sideOpen && !starInboxOpen &&
      !editingMomentId && !viewingMomentId && !revisitNoteId &&
      !locationController.isPermissionPromptOpen &&
      locationController.requestState === 'ready'
    ),
    userLocation,
    moments,
    notes,
    onPrompt: handleAmbientLocationPrompt,
  });
  const {
    applySnapshot,
    deleteMoment,
    exportData,
    exportCompleteBackup,
    importCompleteBackup,
    deleteAllData,
  } = useLocalDataController({
    initialData,
    userId: cloudSession.session?.user.id ?? null,
    persistenceEnabled:
      workspaceReady &&
      !workspaceUpgradeRequired &&
      Boolean(cloudSession.session),
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
    getDatasetRevision: () => cloudDatasetRevisionRef.current,
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
  });
  const deleteMomentWithMedia = useCallback((momentId: string) => {
    const moment = moments.find((item) => item.id === momentId);
    const image = moment
      ? notes.find((item) => item.id === moment.noteId)?.image
      : undefined;
    if (image && cloudSession.cloudAuth) {
      scheduleReplacedNoteImageDeletion(image, cloudSession.cloudAuth);
    }
    deleteMoment(momentId);
  }, [cloudSession.cloudAuth, deleteMoment, moments, notes]);
  const deleteAllDataWithMedia = useCallback(async () => {
    const deleted = await deleteAllData();
    if (deleted && cloudSession.cloudAuth) {
      notes.forEach((note) => {
        if (note.image) {
          scheduleReplacedNoteImageDeletion(note.image, cloudSession.cloudAuth!);
        }
      });
    }
    return deleted;
  }, [cloudSession.cloudAuth, deleteAllData, notes]);
  const importCompleteBackupWithMedia = useCallback(async (
    parsed: Parameters<typeof importCompleteBackup>[0],
    mode: Parameters<typeof importCompleteBackup>[1],
  ) => {
    const imported = await importCompleteBackup(parsed, mode);
    if (imported.ok && mode === 'replace' && cloudSession.cloudAuth) {
      const retained = new Set(parsed.normalized.records.flatMap((record) =>
        record.image ? [`${record.image.bucket}/${record.image.path}`] : []));
      notes.forEach((note) => {
        if (note.image && !retained.has(`${note.image.bucket}/${note.image.path}`)) {
          scheduleReplacedNoteImageDeletion(note.image, cloudSession.cloudAuth!);
        }
      });
    }
    return imported;
  }, [cloudSession.cloudAuth, importCompleteBackup, notes]);

  useEffect(() => {
    if (!cloudSession.cloudAuth) return;
    void retryPendingNoteImageDeletions(
      cloudSession.cloudAuth,
      notes.flatMap((note) => note.image ? [note.image] : []),
    );
  }, [cloudSession.cloudAuth, notes]);
  useEffect(() => {
    if (!cloudSession.ready) return;
    const userId = cloudSession.session?.user.id ?? null;
    if (!userId) {
      if (activeWorkspaceUserRef.current) applySnapshot(createEmptyAppData());
      activeWorkspaceUserRef.current = null;
      setWorkspaceUpgradeRequired(false);
      setWorkspaceReady(false);
      return;
    }
    if (activeWorkspaceUserRef.current === userId && workspaceReady) return;
    setWorkspaceReady(false);
    const loaded = loadAppData(userId, 'real');
    const upgradeRequired = loaded.loadIssue === 'upgrade-required';
    setWorkspaceUpgradeRequired(upgradeRequired);
    applySnapshot(loaded);
    if (upgradeRequired) {
      showToast(copy.feedback.dataUpgradeRequired, {
        placement: 'top',
        durationMs: 8_000,
      });
    }
    activeWorkspaceUserRef.current = userId;
    setWorkspaceReady(true);
  }, [
    applySnapshot,
    cloudSession.ready,
    cloudSession.session?.user.id,
    copy.feedback.dataUpgradeRequired,
    showToast,
    workspaceReady,
  ]);
  useEffect(() => {
    setFollowUpIntervals(
      loadLocalSettings(cloudSession.session?.user.id ?? null).followUpIntervals,
    );
  }, [cloudSession.session?.user.id]);
  const workspaceSnapshot = useMemo(() => ({
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
  }), [
    activeConversationId, conversations, dataMode, followUps,
    initialData.schemaVersion, moments, notes, revisits,
    themePalette, themeTone, lastViewport,
  ]);
  const hasPendingChatRequest = conversations.some((conversation) =>
    conversation.messages.some((message) => message.deliveryState === 'pending'),
  );
  const cloudSnapshot = useMemo(
    () => prepareCloudSnapshot(workspaceSnapshot),
    [workspaceSnapshot],
  );
  const applyCloudSnapshot = useCallback((next: typeof cloudSnapshot) => {
    applySnapshot(next, { preserveTransientState: true });
  }, [applySnapshot]);
  const cloudSync = useCloudSync({
    client: cloudSession.client,
    session: workspaceReady ? cloudSession.session : null,
    snapshot: cloudSnapshot,
    applySnapshot: applyCloudSnapshot,
    blockedByFutureSchema: workspaceUpgradeRequired,
    pauseRemoteRefresh: hasPendingChatRequest,
  });
  useEffect(() => {
    cloudDatasetRevisionRef.current = cloudSync.datasetRevision;
  }, [cloudSync.datasetRevision]);

  const authenticateCloudAccount = async (
    mode: 'login' | 'register',
    account: string,
    password: string,
    passwordConfirmation: string,
  ) => {
    if (!cloudSession.client) return 'unavailable' as const;
    return authenticateAccount({
      client: cloudSession.client,
      mode,
      account,
      password,
      passwordConfirmation,
    });
  };

  const updateCloudPassword = async (password: string) => {
    if (!cloudSession.client || !cloudSession.session) {
      return 'unavailable' as const;
    }
    const { error } = await cloudSession.client.auth.updateUser({ password });
    if (!error) return 'success' as const;
    return error.code === 'weak_password' || error.status === 422
      ? 'weak_password' as const
      : 'unavailable' as const;
  };

  const externalAccess = useMemo(() => createExternalAccessHandlers({
    client: cloudSession.client,
    userId: cloudSession.session?.user.id ?? null,
    dataMode,
    userLocation,
    language,
    snapshot: cloudSnapshot,
    cloudRevision: cloudSync.revision,
    applySnapshot,
    onDraftCreated: (momentId) => {
      setMapFocusMomentId(momentId);
      setActiveView('map');
      setEditingMomentId(momentId);
    },
    onRequireLocation: () => openLocationRequest('settings'),
  }), [
    cloudSession.client,
    cloudSession.session?.user.id,
    cloudSnapshot,
    cloudSync.revision,
    dataMode,
    language,
    openLocationRequest,
    userLocation,
    applySnapshot,
  ]);

  useEffect(() => {
    const client = cloudSession.client;
    const userId = cloudSession.session?.user.id;
    const syncedRevision = cloudSync.revision;
    if (!client || !userId || syncedRevision === null || dataMode !== 'real') return;
    void completePendingProposalApplications({
      client,
      userId,
      snapshot: cloudSnapshot,
      syncedRevision,
    });
  }, [
    cloudSession.client,
    cloudSession.session?.user.id,
    cloudSnapshot,
    cloudSync.revision,
    dataMode,
  ]);

  const chatDelivery = useChatDeliveryHandlers({
    setConversations,
    fallbackTitle: copy.chat.newConversation,
  });

  useEffect(() => {
    document.documentElement.lang = LANGUAGE_HTML_LANGS[language];
    saveLocalSettings({
      ...loadLocalSettings(),
      language,
    });
  }, [dataMode, language]);

  useEffect(() => {
    if (!toast || toast.durationMs <= 0) return;
    const timer = window.setTimeout(() => setToast(null), toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const navigate = (view: AppView) => {
    if (view === 'chat') {
      const currentExists = conversations.some(
        (conversation) => conversation.id === activeConversationId,
      );
      if (!currentExists) {
        const last = [...conversations]
          .reverse()
          .find((conversation) => conversation.kind !== 'companion');
        setActiveConversationId(last?.id ?? createRecordId('conversation'));
      }
    }
    setActiveView(view);
    setSideOpen(false);
  };

  const openConversation = (id: string) => {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id
          ? { ...conversation, unread: false }
          : conversation,
      ),
    );
    setActiveConversationId(id);
    setActiveView('chat');
    setSideOpen(false);
  };

  const startNewConversation = () => {
    setActiveConversationId(createRecordId('conversation'));
    setActiveView('chat');
    setSideOpen(false);
  };

  const deleteConversation = (id: string) => {
    setConversations((current) => current.filter((conversation) => conversation.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(FOLLOW_UP_CONVERSATION_ID);
    }
  };

  const renameConversation = (id: string, title: string) => {
    const nextTitle = title.trim().slice(0, 60);
    if (!nextTitle) return;
    setConversations((current) => {
      if (current.some((conversation) => conversation.id === id)) {
        return current.map((conversation) => conversation.id === id
          ? { ...conversation, title: nextTitle }
          : conversation);
      }
      return [{
        id,
        title: nextTitle,
        preview: '',
        kind: 'regular',
        messages: [],
      }, ...current];
    });
  };

  const exitConversationToMap = () => {
    setActiveView('map');
    setSideOpen(true);
  };

  const openStarInbox = () => {
    const openedAt = Date.now();
    const seenAt = new Date(openedAt).toISOString();
    setFollowUps((current) =>
      current.map((record) =>
        isInboxFollowUp(record, openedAt) && !record.seenAt
          ? { ...record, seenAt }
          : record,
      ),
    );
    setStarInboxOpen(true);
    setSideOpen(false);
  };

  const openNoteById = (noteId: string) => {
    const moment = moments.find((item) => item.noteId === noteId);
    if (moment) setViewingMomentId(moment.id);
  };

  const {
    closeNoteEditor,
    saveNote,
  } = useNoteEditorHandlers({
    language,
    starSavedMessage: copy.feedback.starSaved,
    notes,
    followUps,
    followUpIntervals,
    setMoments,
    setNotes,
    setFollowUps,
    setConversations,
    setEditingMomentId,
    setPhotoAssistByMomentId,
    showToast,
  });

  const updateRevisitedEmotion = (noteId: string, emotion: EmotionKey) => {
    const note = notes.find((item) => item.id === noteId);
    if (!note) return;
    const targetedFollowUp = revisitFollowUpId
      ? followUps.find(
          (record) =>
            record.id === revisitFollowUpId &&
            record.noteId === noteId &&
            (record.status === 'answered' || record.status === 'skipped'),
        )
      : null;
    const relatedFollowUp = targetedFollowUp ?? [...followUps]
      .reverse()
      .find(
        (record) =>
          record.noteId === noteId &&
          (record.status === 'answered' || record.status === 'skipped'),
      );
    if (relatedFollowUp && relatedFollowUp.responseOptionId !== 'skip') {
      const changeDirection = relatedFollowUp.responseOptionId ?? 'different';
      setRevisits((current) => setRevisitCurrentEmotion(
        current,
        note,
        relatedFollowUp.id,
        emotion,
        changeDirection,
      ));
    }
    setRevisitFollowUpId(null);
    setRevisitNoteId(null);
    showToast(copy.feedback.feelingSaved);
  };

  if (!cloudSession.session || !workspaceReady) {
    return (
      <AppLanguageContext.Provider value={languageContextValue}>
        <div className="app-stage">
          <main className="app-shell" data-theme-tone={themeTone} style={themeStyle}>
            <LoginScreen
              ready={cloudSession.ready && !cloudSession.session}
              configured={Boolean(cloudSession.client)}
              onAuthenticate={authenticateCloudAccount}
            />
          </main>
        </div>
      </AppLanguageContext.Provider>
    );
  }

  return (
    <AppLanguageContext.Provider value={languageContextValue}>
      <div className="app-stage">
        <main className="app-shell" data-theme-tone={themeTone} style={themeStyle}>
        <div
          className={`screen-layer persistent-map-layer ${
            activeView === 'chat' ? 'is-hidden' : ''
          }`}
          aria-hidden={
            activeView === 'chat' ||
            Boolean(editingMoment)
          }
          inert={editingMoment ? true : undefined}
        >
          <MapScreen
            workspaceKey={
              getWorkspaceStorageKey(
                cloudSession.session?.user.id ?? null,
                dataMode,
              ) ?? dataMode
            }
            savedViewport={lastViewport}
            onViewportChange={setLastViewport}
            moments={moments}
            setMoments={setMoments}
            notes={notes}
            setNotes={setNotes}
            focusMomentId={mapFocusMomentId}
            setFocusMomentId={setMapFocusMomentId}
            onEditMoment={setEditingMomentId}
            onViewMoment={setViewingMomentId}
            onDeleteMoment={deleteMomentWithMedia}
            userLocation={locationController.userLocation}
            locationRequestState={locationController.requestState}
            resolvedLocationRequest={locationController.resolvedRequest}
            onRequestLocation={locationController.openLocationRequest}
            onToast={showToast}
            cloudAuth={cloudSession.cloudAuth}
            onPhotoAssistResult={(momentId, delivery) => {
              setPhotoAssistByMomentId((current) => ({
                ...current,
                [momentId]: delivery,
              }));
            }}
          />
        </div>

        <Suspense fallback={null}>
        <AnimatePresence mode="wait" initial={false}>
          {activeView === 'calendar' ? (
            <motion.div
              key="calendar"
              className="screen-layer route-overlay-layer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <CalendarScreen
                notes={savedNotes}
                onOpenNote={openNoteById}
                onClose={() => navigate('map')}
              />
            </motion.div>
          ) : null}

          {activeView === 'chat' ? (
            <motion.div
              key="chat"
              className="screen-layer route-overlay-layer"
              initial={{ opacity: 0.96, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0.96 }}
              transition={CONTENT_FADE}
            >
              <ChatScreen
                key={activeConversationId}
                notes={savedNotes}
                followUps={followUps}
                conversations={conversations}
                activeConversationId={activeConversationId}
                workspaceKey={chatWorkspace}
                onAnswerFollowUp={answerFollowUp}
                onRevisitEmotion={(noteId, followUpId) => {
                  setRevisitFollowUpId(followUpId);
                  setRevisitNoteId(noteId);
                }}
                cloudAuth={cloudSession.cloudAuth}
                cloudRevision={cloudSync.revision}
                cloudStatus={cloudSync.status}
                onBeginChat={chatDelivery.beginChat}
                onCompleteChat={chatDelivery.completeChat}
                onFailChat={chatDelivery.failChat}
                onNewConversation={startNewConversation}
                onRenameConversation={renameConversation}
                onExitToMap={exitConversationToMap}
                onToast={showToast}
              />
            </motion.div>
          ) : null}

          {activeView === 'settings' ? (
            <motion.div
              key="settings"
              className="screen-layer route-overlay-layer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <SettingsScreen
                themeTone={themeTone}
                themePalette={themePalette}
                onThemeTone={applyThemePreset}
                onThemeColor={(key, color) =>
                  setThemePalette((current) => ({
                    ...current,
                    [key]: color,
                  }))
                }
                followUpIntervals={followUpIntervals}
                onFollowUpIntervals={setFollowUpIntervals}
                onExportData={exportData}
                onExportCompleteBackup={exportCompleteBackup}
                onImportCompleteBackup={importCompleteBackupWithMedia}
                onDeleteAllData={deleteAllDataWithMedia}
                locationRequestState={locationController.requestState}
                onRequestLocation={() =>
                  locationController.openLocationRequest('settings')
                }
                onToast={showToast}
                cloudConfigured={Boolean(cloudSession.client)}
                cloudUserId={cloudSession.session?.user.id ?? null}
                cloudAccount={
                  typeof cloudSession.session?.user.user_metadata.account_id === 'string'
                    ? cloudSession.session.user.user_metadata.account_id
                    : null
                }
                onSignOut={async () => {
                  const signingOutUserId = cloudSession.session?.user.id;
                  if (signingOutUserId) clearChatDraftsForUser(signingOutUserId);
                  setWorkspaceReady(false);
                  activeWorkspaceUserRef.current = null;
                  applySnapshot(createEmptyAppData());
                  await (cloudSession.client?.auth.signOut() ?? Promise.resolve());
                }}
                onUpdatePassword={updateCloudPassword}
                onIssueMcpToken={externalAccess.issueMcpToken}
                onGetMcpOutputStatus={externalAccess.getMcpOutputStatus}
                onRevokeAllMcpTokens={externalAccess.revokeAllMcpTokens}
                onConnectMyLifeMemory={externalAccess.connect}
                onTestMyLifeMemory={externalAccess.test}
                onGetMyLifeMemoryStatus={externalAccess.status}
                onDisconnectMyLifeMemory={externalAccess.disconnect}
                onListMcpProposals={externalAccess.listMcpProposals}
                onResolveMcpProposal={externalAccess.resolveMcpProposal}
                onBack={() => navigate('map')}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
        </Suspense>

        <AnimatePresence>
          {starInboxOpen ? (
            <motion.div
              key="star-inbox"
              className="screen-layer route-overlay-layer"
              initial={{ opacity: 0.96, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0.96 }}
              transition={CONTENT_FADE}
            >
              <Suspense fallback={null}>
                <StarInboxScreen
                  followUps={followUps}
                  notes={savedNotes}
                  onAnswerFollowUp={(followUpId, label, kind) => {
                    const followUp = followUps.find((record) => record.id === followUpId);
                    answerFollowUp(followUpId, label, kind, 'inbox');
                    if (kind === 'skip' || !followUp) return;
                    setStarInboxOpen(false);
                    window.setTimeout(() => {
                      setRevisitFollowUpId(followUp.id);
                      setRevisitNoteId(followUp.noteId);
                    }, 220);
                  }}
                  onClose={() => setStarInboxOpen(false)}
                />
              </Suspense>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {!editingMoment &&
        !sideOpen &&
        !starInboxOpen &&
        activeView === 'map' ? (
          <>
            <GlobalInboxButton
              unreadCount={unreadStarInboxCount}
              onClick={openStarInbox}
            />
            <GlobalMenuButton
              hasUnread={conversations.some((conversation) => conversation.unread)}
              onClick={() => setSideOpen(true)}
            />
          </>
        ) : null}

        <AnimatePresence>
          {sideOpen ? (
            <SideDrawer
              activeView={activeView}
              conversations={conversations}
              onNavigate={navigate}
              onOpenConversation={openConversation}
              onNewConversation={startNewConversation}
              onDeleteConversation={deleteConversation}
              onClose={() => {
                setSideOpen(false);
                window.setTimeout(() => {
                  document.getElementById('global-menu-button')?.focus();
                }, 220);
              }}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {viewingMoment && viewingNote ? (
            <NoteViewSheet
              key={viewingMoment.id}
              moment={viewingMoment}
              note={viewingNote}
              followUps={followUps.filter(
                (record) =>
                  record.noteId === viewingNote.id &&
                  (record.status === 'answered' || record.status === 'skipped'),
              )}
              revisits={revisits.filter(
                (record) => record.noteId === viewingNote.id,
              )}
              onClose={() => setViewingMomentId(null)}
              onEdit={() => {
                setViewingMomentId(null);
                setEditingMomentId(viewingMoment.id);
              }}
              cloudAuth={cloudSession.cloudAuth}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {editingMoment && editingNote ? (
            <NoteEditorSheet
              key={editingMoment.id}
              moment={editingMoment}
              note={editingNote}
              onSave={saveNote}
              onClose={() => closeNoteEditor(editingMoment.id)}
              onToast={showToast}
              cloudAuth={cloudSession.cloudAuth}
              photoAssistDelivery={photoAssistByMomentId[editingMoment.id] ?? null}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {revisitNote ? (
            <RevisitEmotionModal
              note={revisitNote}
              onClose={() => {
                setRevisitFollowUpId(null);
                setRevisitNoteId(null);
              }}
              onConfirm={updateRevisitedEmotion}
            />
          ) : null}
        </AnimatePresence>

        <LocationPermissionPrompt
          isOpen={locationController.isPermissionPromptOpen}
          requestState={locationController.requestState}
          onClose={locationController.closePermissionPrompt}
          onRequest={locationController.confirmLocationRequest}
        />

        <CloudSyncNotice
          status={cloudSync.status}
          isUserOperationSync={cloudSync.isUserOperationSync}
          errorInfo={cloudSync.errorInfo}
          language={language}
          onSafeMerge={cloudSync.safeMerge}
          onUseRemote={cloudSync.useRemoteVersion}
          onKeepLocal={cloudSync.overwriteRemoteWithLocal}
          onDownloadRecovery={cloudSync.downloadRecovery}
        />
        <AppToast notice={toast} onDismiss={() => setToast(null)} />
        </main>
      </div>
    </AppLanguageContext.Provider>
  );
}
