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
  appendRevisitRecord,
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
  createFollowUpForNote,
} from './domain/followUps';
import {
  loadHealthPreferences,
  isOutsideRestingHeartRateRange,
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
  const [guestDemo, setGuestDemo] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
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
        !item.seenAt &&
        isOutsideRestingHeartRateRange(item.heartRate, healthPreferences),
    ).length;
  const themeStyle = getThemeStyle(themePalette);

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
    loadDemoMode,
    exitDemoMode,
  } = useLocalDataController({
    initialData,
    userId: cloudSession.session?.user.id ?? null,
    persistenceEnabled:
      workspaceReady && (Boolean(cloudSession.session) || guestDemo),
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
      if (!guestDemo) setWorkspaceReady(false);
      return;
    }
    if (activeWorkspaceUserRef.current === userId && workspaceReady) return;
    setWorkspaceReady(false);
    setGuestDemo(false);
    applySnapshot(loadAppData(userId, 'real'));
    activeWorkspaceUserRef.current = userId;
    setWorkspaceReady(true);
  }, [
    applySnapshot,
    cloudSession.ready,
    cloudSession.session?.user.id,
    guestDemo,
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
    notes,
    setMoments,
    setNotes,
    setFollowUps,
    onDraftCreated: (momentId) => {
      setMapFocusMomentId(momentId);
      setActiveView('map');
      setEditingMomentId(momentId);
    },
    onRequireLocation: () => openLocationRequest('settings'),
  }), [
    cloudSession.client,
    cloudSession.session?.user.id,
    dataMode,
    healthPreferences,
    language,
    openLocationRequest,
    userLocation,
    notes,
  ]);

  const updateHealthPreferences = (preferences: HealthPreferences) => {
    const userId = cloudSession.session?.user.id;
    if (!userId || !saveHealthPreferences(userId, preferences)) return false;
    setHealthPreferences(preferences);
    return true;
  };

  const appendGroundedChat = (
    conversationId: string,
    userBody: string,
    assistantBody: string,
    noteIds: string[],
  ) => {
    const createdAt = new Date().toISOString();
    const messages = [
      { id: createRecordId('message'), role: 'user' as const, body: userBody, createdAt },
      { id: createRecordId('message'), role: 'assistant' as const, body: assistantBody, noteIds, createdAt },
    ];
    setConversations((current) => {
      if (current.some((conversation) => conversation.id === conversationId)) {
        return current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                preview: assistantBody.slice(0, 120),
                messages: [...conversation.messages, ...messages],
              }
            : conversation,
        );
      }
      const firstLine = userBody.split(/\r?\n/, 1)[0]?.trim() ?? '';
      const createdConversation: Conversation = {
        id: conversationId,
        title: firstLine.slice(0, 42) || copy.chat.newConversation,
        preview: assistantBody.slice(0, 120),
        kind: 'regular',
        messages,
      };
      const companion = current.find(
        (conversation) => conversation.id === FOLLOW_UP_CONVERSATION_ID,
      );
      return companion
        ? [
            companion,
            createdConversation,
            ...current.filter((conversation) => conversation !== companion),
          ]
        : [createdConversation, ...current];
    });
  };

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
    setSideOpen(false);
  };

  const openStarInbox = () => {
    const seenAt = new Date().toISOString();
    setStarInboxItems((current) =>
      current.map((item) =>
        item.status === 'pending' &&
        !item.seenAt &&
        isOutsideRestingHeartRateRange(item.heartRate, healthPreferences)
          ? { ...item, seenAt }
          : item,
      ),
    );
    setActiveView('inbox');
    setSideOpen(false);
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
      void cloudSession.client
        .from('shortcut_observations')
        .update({ status: 'dismissed' })
        .eq('event_id', sourceEventId);
    }
    showToast(copy.feedback.inboxDismissed);
  };

  const openNoteById = (noteId: string) => {
    const moment = moments.find((item) => item.noteId === noteId);
    if (moment) setViewingMomentId(moment.id);
  };

  const saveNote = (
    momentId: string,
    nextNote: EmotionNote,
    emotion: EmotionKey | null,
    placeRating: EmotionMoment['placeRating'],
    color?: string,
    place?: string,
  ) => {
    const completedExternalEventIds = starInboxItems
      .filter((item) => item.linkedMomentId === momentId)
      .map((item) => item.sourceEventId);
    const pendingFollowUpIds = new Set(
      followUps
        .filter(
          (record) =>
            record.noteId === nextNote.id &&
            (record.status === 'queued' || record.status === 'active'),
        )
        .map((record) => record.id),
    );
    setNotes((current) => {
      const exists = current.some((note) => note.id === nextNote.id);
      return exists
        ? current.map((note) => (note.id === nextNote.id ? nextNote : note))
        : [...current, nextNote];
    });
    setMoments((current) =>
      current.map((moment) =>
        moment.id === momentId
          ? {
              ...moment,
              emotion,
              placeRating,
              place: place ?? moment.place,
              color,
              isNew: false,
              isInboxDraft: false,
            }
          : moment,
      ),
    );
    setStarInboxItems((current) => current.map((item) =>
      item.linkedMomentId === momentId && item.status === 'draft_created'
        ? { ...item, status: 'completed' }
        : item,
    ));
    if (cloudSession.client && completedExternalEventIds.length) {
      void cloudSession.client
        .from('shortcut_observations')
        .update({ status: 'consumed' })
        .in('event_id', completedExternalEventIds);
    }
    setFollowUps((current) => {
      const pendingForNote = current.filter(
        (record) =>
          record.noteId === nextNote.id &&
          (record.status === 'queued' || record.status === 'active'),
      );
      if (!nextNote.followUpEnabled) {
        return current.filter(
          (record) =>
            record.noteId !== nextNote.id ||
            (record.status !== 'queued' && record.status !== 'active'),
        );
      }
      if (pendingForNote.length) return current;
      return [...current, createFollowUpForNote(nextNote, language)];
    });
    if (!nextNote.followUpEnabled && pendingFollowUpIds.size) {
      setConversations((current) =>
        current.map((conversation) => ({
          ...conversation,
          messages: conversation.messages.filter(
            (message) =>
              !message.followUpId ||
              !pendingFollowUpIds.has(message.followUpId),
          ),
        })),
      );
    }
    setEditingMomentId(null);
    setPhotoAssistByMomentId((current) => {
      if (!(momentId in current)) return current;
      const next = { ...current };
      delete next[momentId];
      return next;
    });
    showToast(copy.feedback.starSaved);
  };

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
    setRevisits((current) =>
      appendRevisitRecord(current, note, emotion, relatedFollowUp?.id),
    );
    setRevisitNoteId(null);
    showToast(copy.feedback.feelingSaved);
  };

  if ((!cloudSession.session && !guestDemo) || !workspaceReady) {
    return (
      <AppLanguageContext.Provider value={languageContextValue}>
        <div className="app-stage">
          <main className="app-shell" data-theme-tone={themeTone} style={themeStyle}>
            <LoginScreen
              ready={cloudSession.ready && !cloudSession.session}
              configured={Boolean(cloudSession.client)}
              onAuthenticate={authenticateCloudAccount}
              onOpenDemo={() => {
                applySnapshot(loadAppData(null, 'demo'));
                setGuestDemo(true);
                setWorkspaceReady(true);
              }}
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
                onAnswerFollowUp={answerFollowUp}
                onRevisitEmotion={setRevisitNoteId}
                cloudAuth={cloudSession.cloudAuth}
                cloudRevision={cloudSync.revision}
                cloudStatus={cloudSync.status}
                dataMode={dataMode}
                onGroundedChat={appendGroundedChat}
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
                healthPreferences={healthPreferences}
                onReviewItem={reviewStarInboxItem}
                onDismissItem={dismissStarInboxItem}
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
                dataMode={dataMode}
                onExportData={exportData}
                onImportData={importData}
                onDeleteAllData={deleteAllData}
                onLoadDemo={() => {
                  setGuestDemo(!cloudSession.session);
                  return loadDemoMode();
                }}
                onExitDemo={() => {
                  const exited = exitDemoMode();
                  if (!cloudSession.session) {
                    setGuestDemo(false);
                    setWorkspaceReady(false);
                  }
                  return exited;
                }}
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
                  setWorkspaceReady(false);
                  setGuestDemo(false);
                  activeWorkspaceUserRef.current = null;
                  applySnapshot(createEmptyAppData());
                  await (cloudSession.client?.auth.signOut() ?? Promise.resolve());
                }}
                onUpdatePassword={updateCloudPassword}
                onConfirmInitialUpload={cloudSync.confirmInitialUpload}
                onUseRemoteVersion={cloudSync.useRemoteVersion}
                onOverwriteRemote={cloudSync.overwriteRemoteWithLocal}
                onCreateAutomationTest={() => {
                  const now = new Date().toISOString();
                  const id = createRecordId('shortcut-test');
                  setStarInboxItems((current) => [
                    ...current,
                    {
                      id,
                      source: 'heart-rate',
                      sourceEventId: id,
                      eventAt: now,
                      receivedAt: now,
                      heartRate: 108,
                      verification: 'test',
                      context: 'unknown',
                      samples: [{ bpm: 108, at: now }],
                      lowSignalConfidence: true,
                      status: 'pending',
                    },
                  ]);
                  showToast(copy.feedback.shortcutHeartReceived);
                }}
                onIssueMcpToken={externalAccess.issueMcpToken}
                onRevokeAllMcpTokens={externalAccess.revokeAllTokens}
                healthPreferences={healthPreferences}
                onHealthPreferences={updateHealthPreferences}
                onIssueShortcutPairing={externalAccess.issueShortcutPairing}
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
              onClose={() => setEditingMomentId(null)}
              onSave={saveNote}
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

        <AppToast notice={toast} onDismiss={() => setToast(null)} />
        </main>
      </div>
    </AppLanguageContext.Provider>
  );
}
