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
  RevisitRecord,
  StarInboxItem,
  ThemePalette,
  ThemeTone,
} from "./types";
import {
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
  protectThemePaletteContrast,
} from './app/themePreferences';
import type {
  CommunicationSurface,
  ToastNotice,
  ToastHandler,
} from './app/appTypes';
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
} from './features/inbox/healthPreferences';
import { CelebrationLayer, GlobalInboxButton, GlobalMenuButton, SideDrawer } from './app/AppChrome';
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

function AppToast({
  notice,
  onDismiss,
}: {
  notice: ToastNotice | null;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      {notice ? (
        <motion.div
          key={notice.id}
          className={`toast toast--${notice.placement}`}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.12 }}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span>{notice.message}</span>
          {notice.actionLabel && notice.onAction ? (
            <button
              type="button"
              onClick={() => {
                notice.onAction?.();
                onDismiss();
              }}
            >
              {notice.actionLabel}
            </button>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function App() {
  const initialData = useMemo(() => loadAppData(), []);
  const initialLocalSettings = useMemo(
    () => loadLocalSettings(initialData.dataMode),
    [initialData.dataMode],
  );
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
  const [sideOpen, setSideOpen] = useState(false);
  const [communicationSurface, setCommunicationSurface] =
    useState<CommunicationSurface>('conversation');
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
  const [mapFocusMomentId, setMapFocusMomentId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState(
    FOLLOW_UP_CONVERSATION_ID,
  );
  const [viewingMomentId, setViewingMomentId] = useState<string | null>(null);
  const [editingMomentId, setEditingMomentId] = useState<string | null>(null);
  const [revisitNoteId, setRevisitNoteId] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [photoAssistByMomentId, setPhotoAssistByMomentId] = useState<
    Record<string, PhotoAssistDelivery>
  >({});
  const toastSequenceRef = useRef(0);
  const [themeTone, setThemeTone] = useState<ThemeTone>(initialData.themeTone);
  const [themePalette, setThemePalette] = useState<ThemePalette>(
    initialData.themePalette,
  );
  const healthPreferences = useMemo<HealthPreferences>(
    () => loadHealthPreferences(),
    [],
  );
  const cloudSession = useSupabaseSession();

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
    activeView,
    communicationSurface,
    activeConversationId,
    language,
    navigationCopy: copy.navigation,
    onRequestRevisit: setRevisitNoteId,
  });
  const unreadStarInboxCount =
    starInboxItems.filter(
      (item) =>
        item.status === 'pending' &&
        !item.seenAt &&
        isOutsideRestingHeartRateRange(item.heartRate, healthPreferences),
    ).length +
    followUps.filter((record) => record.status === 'active' && !record.seenAt)
      .length;
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
  });
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
  }), [
    conversations, dataMode, followUps, initialData.schemaVersion, moments,
    notes, revisits, starInboxItems, themePalette, themeTone,
  ]);
  const cloudSync = useCloudSync({
    client: cloudSession.client,
    session: cloudSession.session,
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
      ...loadLocalSettings(dataMode),
      language,
    });
  }, [dataMode, language]);

  useShortcutHeartRateIngress({
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

  useEffect(() => {
    if (!celebrating) return;
    const timer = window.setTimeout(() => setCelebrating(false), 2400);
    return () => window.clearTimeout(timer);
  }, [celebrating]);

  const navigate = (view: AppView) => {
    if (view === 'chat') {
      setActiveConversationId(FOLLOW_UP_CONVERSATION_ID);
      setCommunicationSurface('conversation');
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === FOLLOW_UP_CONVERSATION_ID
            ? { ...conversation, unread: false }
            : conversation,
        ),
      );
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
    setCommunicationSurface('conversation');
    setActiveView('chat');
    setSideOpen(false);
  };

  const startNewConversation = () => {
    setActiveConversationId(createRecordId('conversation'));
    setCommunicationSurface('conversation');
    setActiveView('chat');
    setSideOpen(false);
  };

  const exitConversationToMap = () => {
    setActiveView('map');
    setCommunicationSurface('conversation');
    setSideOpen(true);
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
    setFollowUps((current) =>
      current.map((record) =>
        record.status === 'active' && !record.seenAt
          ? { ...record, seenAt }
          : record,
      ),
    );
    setCommunicationSurface('star-inbox');
    setActiveView('chat');
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
    setStarInboxItems((current) => dismissInboxItem(current, itemId));
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

  if (!cloudSession.session) {
    return (
      <AppLanguageContext.Provider value={languageContextValue}>
        <div className="app-stage">
          <main className="app-shell" data-theme-tone={themeTone} style={themeStyle}>
            <LoginScreen
              ready={cloudSession.ready}
              configured={Boolean(cloudSession.client)}
              onAuthenticate={authenticateCloudAccount}
              onToast={showToast}
            />
            <AppToast notice={toast} onDismiss={() => setToast(null)} />
          </main>
        </div>
      </AppLanguageContext.Provider>
    );
  }

  return (
    <AppLanguageContext.Provider value={languageContextValue}>
      <div className="app-stage">
        <main className="app-shell" data-theme-tone={themeTone} style={themeStyle}>
        {dataMode === 'demo' ? (
          <div className="demo-mode-banner" role="status">
            <strong>{copy.demo.label}</strong>
            <span>{copy.demo.description}</span>
          </div>
        ) : null}
        <div
          className={`screen-layer persistent-map-layer ${
            activeView === 'chat' && communicationSurface === 'conversation'
              ? 'is-hidden'
              : ''
          }`}
          aria-hidden={
            (activeView === 'chat' &&
              communicationSurface === 'conversation') ||
            Boolean(editingMoment)
          }
          inert={editingMoment ? true : undefined}
        >
          <MapScreen
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
              {communicationSurface === 'star-inbox' ? (
                <StarInboxScreen
                  items={starInboxItems}
                  followUps={followUps}
                  notes={savedNotes}
                  healthPreferences={healthPreferences}
                  onReviewItem={reviewStarInboxItem}
                  onDismissItem={dismissStarInboxItem}
                  onAnswerFollowUp={(followUpId, label, kind) => {
                    answerFollowUp(followUpId, label, kind, 'inbox');
                    if (kind !== 'skip') {
                      setActiveView('map');
                    }
                  }}
                  onClose={() => navigate('map')}
                />
              ) : (
                <ChatScreen
                  key={activeConversationId}
                  notes={savedNotes}
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  onAnswerFollowUp={(followUpId, label, kind) =>
                    answerFollowUp(followUpId, label, kind, 'chat')
                  }
                  cloudAuth={cloudSession.cloudAuth}
                  cloudRevision={cloudSync.revision}
                  cloudStatus={cloudSync.status}
                  dataMode={dataMode}
                  onGroundedChat={appendGroundedChat}
                  onNewConversation={startNewConversation}
                  onExitToMap={exitConversationToMap}
                  onToast={showToast}
                />
              )}
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
                  setThemePalette((current) =>
                    protectThemePaletteContrast({
                      ...current,
                      [key]: color,
                    }),
                  )
                }
                dataMode={dataMode}
                onExportData={exportData}
                onImportData={importData}
                onDeleteAllData={deleteAllData}
                onLoadDemo={loadDemoMode}
                onExitDemo={exitDemoMode}
                locationRequestState={locationController.requestState}
                onRequestLocation={() =>
                  locationController.openLocationRequest('settings')
                }
                onToast={showToast}
                cloudConfigured={Boolean(cloudSession.client)}
                cloudAccount={
                  typeof cloudSession.session?.user.user_metadata.account_id === 'string'
                    ? cloudSession.session.user.user_metadata.account_id
                    : null
                }
                cloudStatus={cloudSync.status}
                onSignOut={() => cloudSession.client?.auth.signOut() ?? Promise.resolve()}
                onConfirmInitialUpload={cloudSync.confirmInitialUpload}
                onUseRemoteVersion={cloudSync.useRemoteVersion}
                onOverwriteRemote={cloudSync.overwriteRemoteWithLocal}
                onBack={() => navigate('map')}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
        </Suspense>

        {!editingMoment &&
        !sideOpen &&
        (activeView === 'map' ||
          (activeView === 'chat' && communicationSurface === 'conversation')) ? (
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

        <AnimatePresence>{celebrating ? <CelebrationLayer /> : null}</AnimatePresence>

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
