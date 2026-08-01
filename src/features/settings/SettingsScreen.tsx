import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Database,
  HeartPulse,
  Link2,
  Palette,
  SlidersHorizontal,
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
import { PlannedFeaturePanel } from './PlannedFeaturePanel';
import { GeneralSettingsPanel } from './GeneralSettingsPanel';
import type {
  SettingsPanel,
  SettingsScreenProps,
} from './settingsTypes';
import { useDialogFocus } from '../../app/useDialogFocus';
import { DEMO_PROFILE_IDENTITY } from '../../domain/profileIdentity';

export function SettingsScreen({
  themeTone,
  themePalette,
  onThemeTone,
  onThemeColor,
  dataMode,
  onExportData,
  onImportData,
  onDeleteAllData,
  onLoadDemo,
  onExitDemo,
  locationRequestState,
  onRequestLocation,
  onToast,
  cloudConfigured,
  cloudAccount,
  cloudStatus,
  onSignOut,
  onConfirmInitialUpload,
  onUseRemoteVersion,
  onOverwriteRemote,
  onBack,
}: SettingsScreenProps) {
  const { copy, language } = useAppLanguage();
  const initialSettings = useMemo(
    () => loadLocalSettings(dataMode),
    [dataMode],
  );
  const [panel, setPanel] = useState<SettingsPanel | null>(null);
  const [avatarSrc, setAvatarSrc] = useState(initialSettings.avatarSrc);
  const [profileId, setProfileId] = useState(initialSettings.profileId);
  const [profileName, setProfileName] = useState(
    initialSettings.profileName,
  );
  const rows: Array<{
    id: SettingsPanel;
    label: string;
    icon: typeof Database;
  }> = [
    { id: 'profile', label: copy.settings.profile, icon: Database },
    { id: 'theme', label: copy.settings.theme, icon: Palette },
    {
      id: 'connections',
      label: copy.settings.connections,
      icon: Link2,
    },
    { id: 'health', label: copy.settings.health, icon: HeartPulse },
    {
      id: 'settings',
      label: copy.settings.general,
      icon: SlidersHorizontal,
    },
  ];
  const panelTitle =
    panel === 'profile'
      ? copy.settings.profile
      : panel === 'theme'
        ? copy.settings.theme
        : panel === 'connections'
          ? copy.settings.connections
          : panel === 'health'
            ? copy.settings.health
            : panel === 'language'
              ? copy.settings.language
              : panel === 'location'
                ? copy.location.settingsTitle
                : panel === 'data'
                  ? copy.settings.dataManagement
                  : copy.settings.general;

  useEffect(() => {
    saveLocalSettings({
      ...loadLocalSettings(dataMode),
      avatarSrc,
      profileId,
      profileName,
      language,
    });
  }, [avatarSrc, dataMode, language, profileId, profileName]);

  useEffect(() => {
    if (dataMode === 'demo') {
      setProfileId((current) => current || DEMO_PROFILE_IDENTITY.id);
      setProfileName(
        (current) => current || DEMO_PROFILE_IDENTITY.displayName,
      );
    }
  }, [dataMode]);

  const loadDemo = () => {
    const loaded = onLoadDemo();
    if (loaded) {
      setProfileId(DEMO_PROFILE_IDENTITY.id);
      setProfileName(DEMO_PROFILE_IDENTITY.displayName);
    }
    return loaded;
  };

  const exitDemo = () => {
    const exited = onExitDemo();
    if (exited && profileId === DEMO_PROFILE_IDENTITY.id) {
      setProfileId('');
      setProfileName('');
    }
    return exited;
  };

  const closePanel = () => {
    if (
      panel === 'language' ||
      panel === 'location' ||
      panel === 'data'
    ) {
      setPanel('settings');
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
              {profileName || copy.settings.localProfileName}
            </h2>
            <p>
              {dataMode === 'demo'
                ? copy.settings.demoProfile
                : copy.settings.localProfileOnly}
            </p>
            {profileId ? <code>{profileId}</code> : null}
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
              <header className="settings-panel-header">
                <button
                  className="settings-back-pill"
                  onClick={closePanel}
                >
                  <ChevronLeft size={24} strokeWidth={2.2} />
                  <span id="settings-panel-title">{panelTitle}</span>
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
                  profileId={profileId}
                  profileName={profileName}
                  onAvatarSrc={setAvatarSrc}
                  onProfileName={setProfileName}
                  onToast={onToast}
                />
              ) : panel === 'theme' ? (
                <ThemeSettingsPanel
                  themeTone={themeTone}
                  themePalette={themePalette}
                  onThemeTone={onThemeTone}
                  onThemeColor={onThemeColor}
                />
              ) : panel === 'connections' ||
                panel === 'health' ? (
                <PlannedFeaturePanel
                  feature={panel}
                  cloudConfigured={cloudConfigured}
                  cloudAccount={cloudAccount}
                  cloudStatus={cloudStatus}
                  onSignOut={onSignOut}
                  onConfirmInitialUpload={onConfirmInitialUpload}
                  onUseRemoteVersion={onUseRemoteVersion}
                  onOverwriteRemote={onOverwriteRemote}
                />
              ) : (
                <GeneralSettingsPanel
                  panel={panel}
                  dataMode={dataMode}
                  locationRequestState={locationRequestState}
                  onPanel={setPanel}
                  onRequestLocation={onRequestLocation}
                  onExportData={onExportData}
                  onImportData={onImportData}
                  onDeleteAllData={onDeleteAllData}
                  onLoadDemo={loadDemo}
                  onExitDemo={exitDemo}
                />
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
