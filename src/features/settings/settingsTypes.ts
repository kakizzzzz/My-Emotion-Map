import type { DataMode, ThemePalette, ThemeTone } from '../../types';
import type { LocationRequestState } from '../../useLocationController';
import type { ToastHandler } from '../../app/appTypes';
import type { CloudSyncStatus } from '../../services/useCloudSync';

export type SettingsPanel =
  | 'profile'
  | 'theme'
  | 'connections'
  | 'health'
  | 'settings'
  | 'language'
  | 'location'
  | 'data';

export type SettingsScreenProps = {
  themeTone: ThemeTone;
  themePalette: ThemePalette;
  onThemeTone: (tone: ThemeTone) => void;
  onThemeColor: (key: keyof ThemePalette, color: string) => void;
  dataMode: DataMode;
  onExportData: () => void;
  onImportData: (file: File) => Promise<void>;
  onDeleteAllData: () => void;
  onLoadDemo: () => boolean;
  onExitDemo: () => boolean;
  locationRequestState: LocationRequestState;
  onRequestLocation: () => void;
  onToast: ToastHandler;
  cloudConfigured: boolean;
  cloudAccount: string | null;
  cloudStatus: CloudSyncStatus;
  onSignOut: () => Promise<unknown>;
  onConfirmInitialUpload: () => void;
  onUseRemoteVersion: () => void;
  onOverwriteRemote: () => void;
  onBack: () => void;
};
