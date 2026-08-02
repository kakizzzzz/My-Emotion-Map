export const SHORTCUT_REFRESH_EVENT = 'my-emotion-map:shortcut-refresh';

export type ShortcutConnectionState =
  | 'not_installed'
  | 'installed_unpaired'
  | 'paired'
  | 'verified'
  | 'stale_version'
  | 'expired'
  | 'disconnected';

export type ShortcutPairing = {
  token: string;
  expiresAt: string;
  shortcutVersion: string;
  algorithmVersion: string;
};

export type ShortcutConnectionStatus = {
  state: ShortcutConnectionState;
  expiresAt: string | null;
  lastReceivedAt: string | null;
  lastTestAt: string | null;
  shortcutVersion: string | null;
  algorithmVersion: string | null;
};

export type ShortcutTestResult =
  | 'verified'
  | 'retryable'
  | 'unauthorized'
  | 'unavailable';
