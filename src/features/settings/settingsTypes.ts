import type { HealthPreferences, ThemePalette, ThemeTone } from '../../types';
import type { LocationRequestState } from '../../useLocationController';
import type { ToastHandler } from '../../app/appTypes';
import type { CloudSyncStatus } from '../../services/useCloudSync';
import type { DataExportRange, ReadableExportResult } from '../../app/exportReadableData';

export type SettingsPanel =
  | 'profile'
  | 'theme'
  | 'ai'
  | 'data-account'
  | 'settings'
  | 'language'
  | 'location'
  | 'data'
  | 'export';

export type McpProposal = {
  id: string;
  toolName: string;
  payload: Record<string, unknown>;
  createdAt: string;
  status: 'queued' | 'accepting';
  createdAgainstRevision: number | null;
  targetNoteFingerprint: string | null;
};

export type SettingsScreenProps = {
  themeTone: ThemeTone;
  themePalette: ThemePalette;
  onThemeTone: (tone: ThemeTone) => void;
  onThemeColor: (key: keyof ThemePalette, color: string) => void;
  onExportData: (range: DataExportRange) => ReadableExportResult;
  onImportData: (file: File) => Promise<void>;
  onDeleteAllData: () => void;
  locationRequestState: LocationRequestState;
  onRequestLocation: () => void;
  onToast: ToastHandler;
  cloudConfigured: boolean;
  cloudUserId: string | null;
  cloudAccount: string | null;
  cloudStatus: CloudSyncStatus;
  onSignOut: () => Promise<unknown>;
  onUpdatePassword: (
    password: string,
  ) => Promise<'success' | 'weak_password' | 'unavailable'>;
  onConfirmInitialUpload: () => void;
  onUseRemoteVersion: () => void;
  onOverwriteRemote: () => void;
  onCreateAutomationTest: () => void;
  onIssueMcpToken: (
    kind: 'input' | 'output',
  ) => Promise<{ token: string; expiresAt: string } | null>;
  onRevokeAllMcpTokens: () => Promise<boolean>;
  healthPreferences: HealthPreferences;
  onHealthPreferences: (preferences: HealthPreferences) => boolean;
  onIssueShortcutPairing: () => Promise<{
    token: string;
    expiresAt: string;
  } | null>;
  onListMcpProposals: () => Promise<McpProposal[]>;
  onResolveMcpProposal: (
    proposal: McpProposal,
    decision: 'accepted' | 'rejected',
  ) => Promise<boolean>;
  onBack: () => void;
};
