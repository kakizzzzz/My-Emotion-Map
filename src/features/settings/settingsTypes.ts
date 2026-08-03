import type { ThemePalette, ThemeTone } from '../../types';
import type { LocationRequestState } from '../../useLocationController';
import type { ToastHandler } from '../../app/appTypes';
import type { CloudSyncStatus } from '../../services/useCloudSync';
import type { DataExportRange, ReadableExportResult } from '../../app/exportReadableData';
import type { MyLifeMemoryConnectionStatus } from '../../services/myLifeMemoryConnection';
import type { McpOutputStatus } from '../../services/externalAccess';

export type SettingsPanel =
  | 'profile'
  | 'theme'
  | 'ai'
  | 'my-life-memory-mcp'
  | 'data-account'
  | 'emotion-map-mcp'
  | 'language'
  | 'location'
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
  onIssueMcpToken: () => Promise<{ token: string; expiresAt: string } | null>;
  onGetMcpOutputStatus: () => Promise<McpOutputStatus | null>;
  onRevokeAllMcpTokens: () => Promise<boolean>;
  onConnectMyLifeMemory: (token: string) => Promise<MyLifeMemoryConnectionStatus | null>;
  onTestMyLifeMemory: () => Promise<MyLifeMemoryConnectionStatus | null>;
  onGetMyLifeMemoryStatus: () => Promise<MyLifeMemoryConnectionStatus | null>;
  onDisconnectMyLifeMemory: () => Promise<MyLifeMemoryConnectionStatus | null>;
  onListMcpProposals: () => Promise<McpProposal[]>;
  onResolveMcpProposal: (
    proposal: McpProposal,
    decision: 'accepted' | 'rejected',
  ) => Promise<boolean>;
  onBack: () => void;
};
