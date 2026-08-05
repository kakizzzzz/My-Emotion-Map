import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Bot,
  Database,
  Palette,
  Settings as SettingsIcon,
  UserRound,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { MOTION } from '../../motion';
import { useAppLanguage } from '../../i18n';
import {
  ACCOUNT_PREFERENCES_CHANGED_EVENT,
  buildDefaultProfileName,
  loadLocalSettings,
  saveLocalSettings,
} from '../../app/profilePreferences';
import { ProfileSettingsPanel } from './ProfileSettingsPanel';
import { ThemeSettingsPanel } from './ThemeSettingsPanel';
import { GeneralSettingsPanel } from './GeneralSettingsPanel';
import { ExportDataPanel } from './ExportDataPanel';
import type {
  SettingsPanel,
  SettingsScreenProps,
} from './settingsTypes';
import { useDialogFocus } from '../../app/useDialogFocus';
import { AiSettingsPanel } from './AiSettingsPanel';
import { DataAccountSettingsPanel } from './DataAccountSettingsPanel';
import { EmotionMapMcpPanel } from './EmotionMapMcpPanel';
import { FollowUpSettingsPanel } from './FollowUpSettingsPanel';

export function SettingsScreen({
  themeTone,
  themePalette,
  onThemeTone,
  onThemeColor,
  followUpIntervals,
  onFollowUpIntervals,
  onExportData,
  onExportCompleteBackup,
  onImportCompleteBackup,
  onDeleteAllData,
  locationRequestState,
  onRequestLocation,
  onToast,
  cloudUserId,
  cloudAccount,
  onSignOut,
  onUpdatePassword,
  onIssueMcpToken,
  onGetMcpOutputStatus,
  onRevokeAllMcpTokens,
  onConnectMyLifeMemory,
  onTestMyLifeMemory,
  onGetMyLifeMemoryStatus,
  onDisconnectMyLifeMemory,
  onListMcpProposals,
  onResolveMcpProposal,
  onBack,
}: SettingsScreenProps) {
  const { copy, language } = useAppLanguage();
  const initialSettings = useMemo(
    () => loadLocalSettings(cloudUserId),
    [cloudUserId],
  );
  const [panel, setPanel] = useState<SettingsPanel | null>(null);
  const [avatarSrc, setAvatarSrc] = useState(initialSettings.avatarSrc);
  const [profileName, setProfileName] = useState(
    cloudAccount && (
      !initialSettings.profileName ||
      initialSettings.profileName.toLocaleLowerCase() ===
        cloudAccount.trim().toLocaleLowerCase()
    )
      ? buildDefaultProfileName(cloudAccount, language)
      : initialSettings.profileName,
  );
  const [aiUserPrompt, setAiUserPrompt] = useState(
    initialSettings.aiUserPrompt,
  );
  const [aiContextMessageCount, setAiContextMessageCount] = useState(
    initialSettings.aiContextMessageCount,
  );
  const preferencesToSave = useMemo(() => ({
    ...loadLocalSettings(cloudUserId),
    avatarSrc,
    profileName,
    language,
    aiUserPrompt,
    aiContextMessageCount,
    followUpIntervals,
  }), [
    aiContextMessageCount,
    aiUserPrompt,
    avatarSrc,
    cloudUserId,
    followUpIntervals,
    language,
    profileName,
  ]);
  const preferencesFingerprint = JSON.stringify(preferencesToSave);
  const persistedPreferencesRef = useRef({
    userId: cloudUserId,
    fingerprint: preferencesFingerprint,
  });
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!cloudUserId || detail?.userId !== cloudUserId) return;
      const next = loadLocalSettings(cloudUserId);
      setAvatarSrc(next.avatarSrc);
      setProfileName(next.profileName);
      setAiUserPrompt(next.aiUserPrompt);
      setAiContextMessageCount(next.aiContextMessageCount);
    };
    window.addEventListener(ACCOUNT_PREFERENCES_CHANGED_EVENT, listener);
    return () => window.removeEventListener(
      ACCOUNT_PREFERENCES_CHANGED_EVENT,
      listener,
    );
  }, [cloudUserId]);
  const rows: Array<{
    id: SettingsPanel;
    label: string;
    icon: typeof Database;
  }> = [
    { id: 'profile', label: copy.settings.personal, icon: Database },
    { id: 'theme', label: copy.settings.appearance, icon: Palette },
    { id: 'ai', label: copy.settings.ai, icon: Bot },
    { id: 'data-account', label: copy.settings.dataAccount, icon: SettingsIcon },
  ];
  const panelTitle =
    panel === 'profile'
      ? copy.settings.profile
      : panel === 'theme'
        ? copy.settings.theme
        : panel === 'ai'
          ? copy.settings.ai
          : panel === 'my-life-memory-mcp'
            ? copy.settings.myLifeMemoryMcp
            : panel === 'data-account'
                ? copy.settings.dataAccount
                : panel === 'emotion-map-mcp'
                  ? copy.settings.emotionMapMcp
                  : panel === 'language'
                    ? copy.settings.language
                    : panel === 'location'
                      ? copy.location.settingsTitle
                      : panel === 'follow-up'
                        ? copy.settings.followUpSchedule
                      : panel === 'export'
                        ? copy.settings.exportData
                        : copy.settings.general;

  useEffect(() => {
    const persisted = persistedPreferencesRef.current;
    if (persisted.userId !== cloudUserId) {
      persistedPreferencesRef.current = {
        userId: cloudUserId,
        fingerprint: preferencesFingerprint,
      };
      return;
    }
    if (persisted.fingerprint === preferencesFingerprint) return;
    if (saveLocalSettings(preferencesToSave, cloudUserId)) {
      persistedPreferencesRef.current.fingerprint = preferencesFingerprint;
    }
  }, [cloudUserId, preferencesFingerprint, preferencesToSave]);

  const closePanel = () => {
    if (
      panel === 'language' ||
      panel === 'location' ||
      panel === 'follow-up' ||
      panel === 'export' ||
      panel === 'emotion-map-mcp'
    ) {
      setPanel('data-account');
      return;
    }
    if (panel === 'my-life-memory-mcp') {
      setPanel('ai');
      return;
    }
    setPanel(null);
  };
  const rootDialogRef = useDialogFocus<HTMLDivElement>({
    isOpen: panel === null,
    onEscape: onBack,
  });
  const panelDialogRef = useDialogFocus<HTMLDivElement>({
    isOpen: panel !== null,
    onEscape: closePanel,
  });

  return (
    <section
      className="paper-screen settings-screen"
      aria-label={copy.settings.title}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onBack();
      }}
    >
      <motion.div
        ref={rootDialogRef}
        className="settings-paper"
        role="dialog"
        aria-modal="true"
        aria-label={copy.settings.title}
        tabIndex={-1}
        initial={{ y: 38, opacity: 0.92 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={MOTION.sheet}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="screen-header settings-screen-header">
          <h1 className="visually-hidden">{copy.settings.title}</h1>
          <button
            className="round-back-button popup-close-button"
            onClick={onBack}
            aria-label={copy.common.close}
          >
            <X size={22} strokeWidth={2.2} />
          </button>
        </header>

        <div className="profile-card">
          <button
            className="profile-avatar"
            onClick={() => setPanel('profile')}
            aria-label={copy.settings.changeAvatar}
          >
            {avatarSrc ? (
              <img src={avatarSrc} alt={copy.settings.currentAvatar} />
            ) : (
              <UserRound size={42} strokeWidth={2.2} />
            )}
          </button>
          <div>
            <h2>{profileName || cloudAccount || copy.settings.localProfileName}</h2>
            {cloudAccount ? <p>ID:{cloudAccount}</p> : null}
          </div>
        </div>

        <div className="settings-list">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <button key={row.id} onClick={() => setPanel(row.id)}>
                <Icon size={25} strokeWidth={2.2} />
                <strong>{row.label}</strong>
                <ChevronRight size={28} strokeWidth={2.2} />
              </button>
            );
          })}
        </div>

        {cloudUserId ? (
          <button
            className="settings-sign-out-button"
            onClick={() => void onSignOut()}
          >
            {copy.settings.signOut}
          </button>
        ) : null}

        <AnimatePresence>
          {panel ? (
            <motion.div
              ref={panelDialogRef}
              className="settings-panel"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 14 }}
              transition={MOTION.sheet}
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-panel-title"
              tabIndex={-1}
            >
              <h2 id="settings-panel-title" className="visually-hidden">
                {panelTitle}
              </h2>
              <header className="settings-panel-header">
                <button
                  className="round-back-button settings-panel-back"
                  onClick={closePanel}
                  aria-label={copy.common.back}
                >
                  <ChevronLeft size={24} strokeWidth={2.2} />
                </button>
                <button
                  className="popup-close-button"
                  onClick={onBack}
                  aria-label={copy.common.close}
                >
                  <X size={20} strokeWidth={2.2} />
                </button>
              </header>

              {panel === 'profile' ? (
                <ProfileSettingsPanel
                  avatarSrc={avatarSrc}
                  profileName={profileName}
                  canChangePassword={Boolean(cloudUserId)}
                  onAvatarSrc={setAvatarSrc}
                  onProfileName={setProfileName}
                  onUpdatePassword={onUpdatePassword}
                  onToast={onToast}
                />
              ) : panel === 'theme' ? (
                <ThemeSettingsPanel
                  themeTone={themeTone}
                  themePalette={themePalette}
                  onThemeTone={onThemeTone}
                  onThemeColor={onThemeColor}
                />
              ) : panel === 'ai' || panel === 'my-life-memory-mcp' ? (
                <AiSettingsPanel
                  mode={panel}
                  userPrompt={aiUserPrompt}
                  contextMessageCount={aiContextMessageCount}
                  onUserPrompt={setAiUserPrompt}
                  onContextMessageCount={setAiContextMessageCount}
                  onPanel={setPanel}
                  onConnectMyLifeMemory={onConnectMyLifeMemory}
                  onTestMyLifeMemory={onTestMyLifeMemory}
                  onGetMyLifeMemoryStatus={onGetMyLifeMemoryStatus}
                  onDisconnectMyLifeMemory={onDisconnectMyLifeMemory}
                />
              ) : panel === 'data-account' ? (
                <DataAccountSettingsPanel
                  onPanel={setPanel}
                />
              ) : panel === 'emotion-map-mcp' ? (
                <EmotionMapMcpPanel
                  onIssueToken={onIssueMcpToken}
                  onGetStatus={onGetMcpOutputStatus}
                  onRevokeTokens={onRevokeAllMcpTokens}
                  onListProposals={onListMcpProposals}
                  onResolveProposal={onResolveMcpProposal}
                />
              ) : panel === 'follow-up' ? (
                <FollowUpSettingsPanel
                  intervals={followUpIntervals}
                  onIntervals={onFollowUpIntervals}
                />
              ) : panel === 'export' ? (
                <ExportDataPanel
                  onExportData={onExportData}
                  onExportCompleteBackup={onExportCompleteBackup}
                  onImportCompleteBackup={onImportCompleteBackup}
                  onDeleteAllData={onDeleteAllData}
                  workspaceAvailable={Boolean(cloudUserId)}
                />
              ) : (
                <GeneralSettingsPanel
                  panel={panel}
                  locationRequestState={locationRequestState}
                  onRequestLocation={onRequestLocation}
                />
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
