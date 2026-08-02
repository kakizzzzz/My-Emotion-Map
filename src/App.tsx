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
  HealthPreferences,
  MapViewport,
  RevisitRecord,
  StarInboxItem,
  ThemePalette,
  ThemeTone,
} from "./types";
import {
  createEmptyAppData,
  getWorkspaceStorageKey,
  loadAppData,
  setRevisitCurrentEmotion,
  dismissInboxItem,
} from './app/appDataRepository';
import {
  loadLocalSettings,
  saveLocalSettings,
} from './app/profilePreferences';
import {
  THEME_PRESETS,
  getThemeStyle,
} from './app/themePreferences';
import type { ToastNotice, ToastHandler } from './app/appTypes';
import { AppToast } from './app/AppToast';
import { createRecord } from './app/recordFactory';
import { useFollowUpCoordinator } from './app/useFollowUpCoordinator';
import { useLocalDataController } from './app/useLocalDataController';
import {
  FOLLOW_UP_CONVERSATION_ID,
} from './domain/followUps';
import {
  loadHealthPreferences,
  saveHealthPreferences,
} from './features/inbox/healthPreferences';
import { GlobalInboxButton, GlobalMenuButton, SideDrawer } from './app/AppChrome';
import { LocationPermissionPrompt } from './features/location/LocationPermissionPrompt';
import { MapScreen } from './features/map/MapScreen';
import { NoteEditorSheet } from './features/notes/NoteEditorSheet';
import { NoteViewSheet } from './features/notes/NoteViewSheet';
import { RevisitEmotionModal } from './features/notes/RevisitEmotionModal';
import { useShortcutHeartRateIngress } from './features/inbox/useShortcutHeartRateIngress';
import { useSupabaseSession } from './services/useSupabaseSession';
import type { PhotoAssistDelivery } from './app/appTypes';
import { useCloudSync } from './services/useCloudSync';
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
import { useFirstRunOnboarding } from './app/firstRunOnboarding';
import { FirstRunOnboarding } from './features/onboarding/FirstRunOnboarding';
import { useChatDeliveryHandlers } from './app/useChatDeliveryHandlers';

const CalendarScreen = lazy(() =>
  import('./features/calendar/CalendarScreen').then((module) => ({
    default: module.CalendarScreen,
  })),
);
const ChatScreen = lazy(() =>
  import('./features/chat/ChatScreen').then((module) => ({ default: module.ChatScreen })),
);
const StarInboxScreen = lazy(() =>
  import('./features/inbox/StarInboxScreen').then((module) => ({
    default: module.StarInboxScreen,
  })),
);
const SettingsScreen = lazy(() =>
  import('./features/settings/SettingsScreen').then((module) => ({
    default: module.SettingsScreen,
  })),
);

export function App() {
  const initialData = useMemo(() => createEmptyAppData(), []);
  const initialLocalSettings = useMemo(() => loadLocalSettings(), []);
  const [activeView, setActiveView] = useState<AppView>('map');
  const [language, setLanguage] = useState<AppLanguage>(
    initialLocalSettings.language,
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
  const locationController = useLocationController({
    isMapActive: activeView === 'map',
  });
  const userLocation = locationController.userLocation;
  const openLocationRequest = locationController.openLocationRequest;
  const [sideOpen, setSideOpen] = useState(false);
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
  const [starInboxItems, setStarInboxItems] =
    useState<StarInboxItem[]>(initialData.starInboxItems);
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
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [photoAssistByMomentId, setPhotoAssistByMomentId] = useState<
    Record<string, PhotoAssistDelivery>
  >({});
  const toastSequenceRef = useRef(0);
  const [themeTone, setThemeTone] = useState<ThemeTone>(initialData.themeTone);
  const [themePalette, setThemePalette] = useState<ThemePalette>(
    initialData.themePalette,
  );
  const [lastViewport, setLastViewport] = useState<MapViewport | undefined>(
    initialData.lastViewport,
  );
  const { onboardingTarget, openOnboardingIfNeeded, completeOnboarding } =
    useFirstRunOnboarding();
  const cloudSession = useSupabaseSession();
  const [healthPreferences, setHealthPreferences] = useState<HealthPreferences>(
    () => loadHealthPreferences(null),
  );
  useEffect(() => {
    setHealthPreferences(
      loadHealthPreferences(cloudSession.session?.user.id ?? null),
    );
  }, [cloudSession.session?.user.id]);

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
  const unreadStarInboxCount =
    starInboxItems.filter(
      (item) =>
        item.status === 'pending' &&
        !item.seenAt,
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
  const {
    applySnapshot,
    deleteMoment,
    exportData,
    importData,
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
  });
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
    openOnboardingIfNeeded('real', userId);
  }, [
    applySnapshot,
    cloudSession.ready,
    cloudSession.session?.user.id,
    copy.feedback.dataUpgradeRequired,
    openOnboardingIfNeeded,
    showToast,
    workspaceReady,
  ]);
  const cloudSnapshot = useMemo(() => ({
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
  }), [
    activeConversationId, conversations, dataMode, followUps,
    initialData.schemaVersion, moments, notes, revisits, starInboxItems,
    themePalette, themeTone, lastViewport,
  ]);
  const cloudSync = useCloudSync({
    client: cloudSession.client,
    session: workspaceReady ? cloudSession.session : null,
    snapshot: cloudSnapshot,
    applySnapshot,
    blockedByFutureSchema: workspaceUpgradeRequired,
  });

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
    healthPreferences,
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
    healthPreferences,
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

  const updateHealthPreferences = (preferences: HealthPreferences) => {
    const userId = cloudSession.session?.user.id;
    if (!userId || !saveHealthPreferences(userId, preferences)) return false;
    setHealthPreferences(preferences);
    return true;
  };

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

  useShortcutHeartRateIngress({
    userId: cloudSession.session?.user.id ?? null,
    client: cloudSession.client,
    items: starInboxItems,
    setItems: setStarInboxItems,
    preferences: healthPreferences,
    onToast: showToast,
    messages: useMemo(() => ({
      invalid: copy.feedback.shortcutHeartInvalid,
      withinRange: copy.feedback.shortcutHeartWithinRange,
      received: copy.feedback.shortcutHeartReceived,
    }), [copy.feedback]),
  });

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

  const exitConversationToMap = () => {
    setActiveView('map');
    setSideOpen(true);
  };

  const openStarInbox = () => {
    setActiveView('inbox');
    setSideOpen(false);
  };

  const markStarInboxItemSeen = (itemId: string) => {
    const seenAt = new Date().toISOString();
    setStarInboxItems((current) => current.map((item) =>
      item.id === itemId && !item.seenAt ? { ...item, seenAt } : item,
    ));
  };

  const reviewStarInboxItem = async (item: StarInboxItem) => {
    if (!window.isSecureContext || !navigator.geolocation) {
      showToast(copy.feedback.locationRequired);
      return;
    }
    const position = await new Promise<GeolocationPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
      });
    });
    if (!position) {
      showToast(copy.feedback.locationRequired);
      return;
    }
    const wallTime = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(item.eventAt);
    const { moment, note } = createRecord({
      longitude: position.coords.longitude,
      latitude: position.coords.latitude,
      place: copy.map.selectedLocation,
      language,
      source: 'inbox',
      date: wallTime?.[1],
      time: wallTime?.[2],
      eventTimeSource: 'health-sample',
      heartRate: item.heartRate,
      isInboxDraft: true,
      locationCapturedAt: new Date().toISOString(),
      locationTimeRelation: 'confirmation',
    });
    setMoments((current) => [...current, moment]);
    setNotes((current) => [...current, note]);
    const now = new Date().toISOString();
    setStarInboxItems((current) => current.map((entry) =>
      entry.id === item.id
        ? {
            ...entry,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            locationCapturedAt: now,
            locationTimeRelation: 'confirmation',
            locationAccuracyMeters: position.coords.accuracy,
            linkedMomentId: moment.id,
            confirmedAt: now,
            status: 'draft_created',
            seenAt: entry.seenAt ?? now,
          }
        : entry,
    ));
    if (cloudSession.client && item.id.startsWith('shortcut:')) {
      void cloudSession.client
        .from('shortcut_observations')
        .update({ status: 'consumed' })
        .eq('id', item.id.slice('shortcut:'.length));
    }
    setViewingMomentId(null);
    setMapFocusMomentId(moment.id);
    setActiveView('map');
    setEditingMomentId(moment.id);
  };

  const dismissStarInboxItem = (itemId: string) => {
    const sourceEventId = starInboxItems.find((item) => item.id === itemId)
      ?.sourceEventId;
    setStarInboxItems((current) => dismissInboxItem(current, itemId));
    if (sourceEventId && cloudSession.client) {
      const query = cloudSession.client
        .from('shortcut_observations')
        .update({ status: 'dismissed' });
      void (itemId.startsWith('shortcut:')
        ? query.eq('id', itemId.slice('shortcut:'.length))
        : query.eq('event_id', sourceEventId));
    }
    showToast(copy.feedback.inboxDismissed);
  };

  const openNoteById = (noteId: string) => {
    const moment = moments.find((item) => item.noteId === noteId);
    if (moment) setViewingMomentId(moment.id);
  };

  const {
    closeNoteEditor,
    saveNoteDraft,
    deleteNoteDraft,
    saveNote,
  } = useNoteEditorHandlers({
    client: cloudSession.client,
    language,
    starSavedMessage: copy.feedback.starSaved,
    moments,
    starInboxItems,
    followUps,
    setMoments,
    setNotes,
    setStarInboxItems,
    setFollowUps,
    setConversations,
    setEditingMomentId,
    setPhotoAssistByMomentId,
    showToast,
  });

  const updateRevisitedEmotion = (noteId: string, emotion: EmotionKey) => {
    const note = notes.find((item) => item.id === noteId);
    if (!note) return;
    const relatedFollowUp = [...followUps]
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
            activeView === 'chat' || activeView === 'inbox' ? 'is-hidden' : ''
          }`}
          aria-hidden={
            activeView === 'chat' || activeView === 'inbox' ||
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
            dataMode={dataMode}
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
            onDeleteMoment={deleteMoment}
            userLocation={locationController.userLocation}
            locationRequestState={locationController.requestState}
            resolvedLocationRequest={locationController.resolvedRequest}
            onRequestLocation={locationController.openLocationRequest}
            onToast={showToast}
            cloudAuth={cloudSession.cloudAuth}
            onPhotoAssistResult={(momentId, delivery) =>
              setPhotoAssistByMomentId((current) => ({
                ...current,
                [momentId]: delivery,
              }))
            }
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
                onRevisitEmotion={setRevisitNoteId}
                cloudAuth={cloudSession.cloudAuth}
                cloudRevision={cloudSync.revision}
                cloudStatus={cloudSync.status}
                dataMode={dataMode}
                onBeginChat={chatDelivery.beginChat}
                onCompleteChat={chatDelivery.completeChat}
                onFailChat={chatDelivery.failChat}
                onNewConversation={startNewConversation}
                onExitToMap={exitConversationToMap}
                onToast={showToast}
              />
            </motion.div>
          ) : null}

          {activeView === 'inbox' ? (
            <motion.div
              key="inbox"
              className="screen-layer route-overlay-layer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <StarInboxScreen
                items={starInboxItems}
                onReviewItem={reviewStarInboxItem}
                onDismissItem={dismissStarInboxItem}
                onMarkSeen={markStarInboxItemSeen}
                onClose={() => navigate('map')}
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
                onExportData={exportData}
                onImportData={importData}
                onDeleteAllData={deleteAllData}
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
                cloudStatus={cloudSync.status}
                onSignOut={async () => {
                  const signingOutUserId = cloudSession.session?.user.id;
                  if (signingOutUserId) clearChatDraftsForUser(signingOutUserId);
                  setWorkspaceReady(false);
                  activeWorkspaceUserRef.current = null;
                  applySnapshot(createEmptyAppData());
                  await (cloudSession.client?.auth.signOut() ?? Promise.resolve());
                }}
                onUpdatePassword={updateCloudPassword}
                onConfirmInitialUpload={cloudSync.confirmInitialUpload}
                onUseRemoteVersion={cloudSync.useRemoteVersion}
                onOverwriteRemote={cloudSync.overwriteRemoteWithLocal}
                onTestShortcutPairing={externalAccess.testShortcutPairing}
                onIssueMcpToken={externalAccess.issueMcpToken}
                onRevokeAllMcpTokens={externalAccess.revokeAllMcpTokens}
                healthPreferences={healthPreferences}
                onHealthPreferences={updateHealthPreferences}
                onIssueShortcutPairing={externalAccess.issueShortcutPairing}
                onGetShortcutConnectionStatus={externalAccess.getShortcutConnectionStatus}
                onRevokeShortcutTokens={externalAccess.revokeShortcutTokens}
                onListMcpProposals={externalAccess.listMcpProposals}
                onResolveMcpProposal={externalAccess.resolveMcpProposal}
                onBack={() => navigate('map')}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
        </Suspense>

        {!editingMoment &&
        !sideOpen &&
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
              onSaveDraft={saveNoteDraft}
              onDeleteDraft={deleteNoteDraft}
              onClose={() => closeNoteEditor(editingMoment.id)}
              onToast={showToast}
              photoAssistDelivery={photoAssistByMomentId[editingMoment.id] ?? null}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {revisitNote ? (
            <RevisitEmotionModal
              note={revisitNote}
              onClose={() => setRevisitNoteId(null)}
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

        {onboardingTarget ? (
          <FirstRunOnboarding
            dataMode={onboardingTarget.dataMode}
            onComplete={completeOnboarding}
          />
        ) : null}

        <AppToast notice={toast} onDismiss={() => setToast(null)} />
        </main>
      </div>
    </AppLanguageContext.Provider>
  );
}
