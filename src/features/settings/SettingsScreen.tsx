import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Bot,
  Database,
  HardDrive,
  Palette,
  UserRound,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { MOTION } from '../../motion';
import { useAppLanguage } from '../../i18n';
import {
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

export function SettingsScreen({
  themeTone,
  themePalette,
  onThemeTone,
  onThemeColor,
  onExportData,
  onImportData,
  onDeleteAllData,
  locationRequestState,
  onRequestLocation,
  onToast,
  cloudUserId,
  cloudAccount,
  cloudStatus,
  onSignOut,
  onUpdatePassword,
  onConfirmInitialUpload,
  onUseRemoteVersion,
  onOverwriteRemote,
  onTestShortcutPairing,
  onIssueMcpToken,
  onRevokeAllMcpTokens,
  healthPreferences,
  onHealthPreferences,
  onIssueShortcutPairing,
  onGetShortcutConnectionStatus,
  onRevokeShortcutTokens,
  onListMcpProposals,
  onResolveMcpProposal,
  onBack,
}: SettingsScreenProps) {
  const { copy, language } = useAppLanguage();
  const initialSettings = useMemo(
    () => loadLocalSettings(cloudUserId),
    [cloudUserId],
  );
  const initialProfileName =
    initialSettings.profileName.trim().toLocaleLowerCase() ===
    cloudAccount?.trim().toLocaleLowerCase()
      ? ''
      : initialSettings.profileName;
  const [panel, setPanel] = useState<SettingsPanel | null>(null);
  const [avatarSrc, setAvatarSrc] = useState(initialSettings.avatarSrc);
  const [profileName, setProfileName] = useState(
    initialProfileName,
  );
  const [aiStyles, setAiStyles] = useState(initialSettings.aiToneTags);
  const rows: Array<{
    id: SettingsPanel;
    label: string;
    icon: typeof Database;
  }> = [
    { id: 'profile', label: copy.settings.personal, icon: Database },
    { id: 'theme', label: copy.settings.appearance, icon: Palette },
    { id: 'ai', label: copy.settings.ai, icon: Bot },
    { id: 'data-account', label: copy.settings.dataAccount, icon: HardDrive },
  ];
  const panelTitle =
    panel === 'profile'
      ? copy.settings.profile
      : panel === 'theme'
        ? copy.settings.theme
        : panel === 'ai'
          ? copy.settings.ai
          : panel === 'data-account'
            ? copy.settings.dataAccount
            : panel === 'language'
              ? copy.settings.language
              : panel === 'location'
                ? copy.location.settingsTitle
                : panel === 'data'
                  ? copy.settings.dataManagement
                  : panel === 'export'
                    ? copy.settings.exportData
                  : copy.settings.general;

  useEffect(() => {
    saveLocalSettings({
      ...loadLocalSettings(cloudUserId),
      avatarSrc,
      profileName,
      language,
      aiToneTags: aiStyles,
    }, cloudUserId);
  }, [aiStyles, avatarSrc, cloudUserId, language, profileName]);

  const closePanel = () => {
    if (
      panel === 'language' ||
      panel === 'location' ||
      panel === 'data' ||
      panel === 'export'
    ) {
      setPanel('data-account');
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
            <h2>
              {profileName || cloudAccount || copy.settings.localProfileName}
            </h2>
            {cloudAccount ? <p>ID: {cloudAccount}</p> : null}
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
                  accountId={cloudAccount}
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
              ) : panel === 'ai' ? (
                <AiSettingsPanel
                  styles={aiStyles}
                  onStyles={setAiStyles}
                  onTestShortcutPairing={onTestShortcutPairing}
                  onIssueToken={onIssueMcpToken}
                  onRevokeTokens={onRevokeAllMcpTokens}
                  healthPreferences={healthPreferences}
                  onHealthPreferences={onHealthPreferences}
                  onIssueShortcutPairing={onIssueShortcutPairing}
                  onGetShortcutConnectionStatus={onGetShortcutConnectionStatus}
                  onRevokeShortcutTokens={onRevokeShortcutTokens}
                  onListMcpProposals={onListMcpProposals}
                  onResolveMcpProposal={onResolveMcpProposal}
                />
              ) : panel === 'data-account' ? (
                <DataAccountSettingsPanel
                  cloudStatus={cloudStatus}
                  onPanel={setPanel}
                  onConfirmInitialUpload={onConfirmInitialUpload}
                  onUseRemoteVersion={onUseRemoteVersion}
                  onOverwriteRemote={onOverwriteRemote}
                />
              ) : panel === 'export' ? (
                <ExportDataPanel onExportData={onExportData} />
              ) : (
                <GeneralSettingsPanel
                  panel={panel}
                  locationRequestState={locationRequestState}
                  onPanel={setPanel}
                  onRequestLocation={onRequestLocation}
                  onImportData={onImportData}
                  onDeleteAllData={onDeleteAllData}
                />
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
