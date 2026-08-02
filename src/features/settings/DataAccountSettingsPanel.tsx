import {
  ChevronRight,
  Cloud,
  Download,
  KeyRound,
  Languages,
  MapPin,
} from 'lucide-react';
import { useAppLanguage } from '../../i18n';
import type { CloudSyncStatus } from '../../services/useCloudSync';
import type { SettingsPanel } from './settingsTypes';

export function DataAccountSettingsPanel({
  cloudStatus,
  onPanel,
  onConfirmInitialUpload,
  onUseRemoteVersion,
  onOverwriteRemote,
}: {
  cloudStatus: CloudSyncStatus;
  onPanel: (panel: SettingsPanel) => void;
  onConfirmInitialUpload: () => void;
  onUseRemoteVersion: () => void;
  onOverwriteRemote: () => void;
}) {
  const { copy } = useAppLanguage();
  const needsCloudDecision =
    cloudStatus === 'upload_confirmation_required' || cloudStatus === 'conflict';
  return (
    <section className="connections-card-list data-account-panel">
      {needsCloudDecision ? (
        <article className="connection-card is-open">
          <div className="connection-card__header">
            <span className="connection-card__icon">
              <Cloud size={22} strokeWidth={2.2} />
            </span>
            <span className="connection-card__title">
              <strong>{copy.settings.cloudStatus[cloudStatus]}</strong>
            </span>
          </div>
          <div className="connection-card__body">
            {cloudStatus === 'upload_confirmation_required' ? (
              <button className="connection-check-button" onClick={onConfirmInitialUpload}>
                {copy.settings.cloudConfirmInitialUpload}
              </button>
            ) : null}
            {cloudStatus === 'conflict' ? (
              <div className="cloud-conflict-actions">
                <button className="connection-check-button" onClick={onUseRemoteVersion}>
                  {copy.settings.cloudUseRemote}
                </button>
                <button className="connection-check-button" onClick={onOverwriteRemote}>
                  {copy.settings.cloudOverwriteRemote}
                </button>
              </div>
            ) : null}
          </div>
        </article>
      ) : null}
      <div className="settings-submenu">
        <button onClick={() => onPanel('language')}>
          <Languages size={24} strokeWidth={2.2} />
          <span>{copy.settings.language}</span>
          <ChevronRight size={24} strokeWidth={2.2} />
        </button>
        <button onClick={() => onPanel('location')}>
          <MapPin size={24} strokeWidth={2.2} />
          <span>{copy.location.settingsTitle}</span>
          <ChevronRight size={24} strokeWidth={2.2} />
        </button>
        <button onClick={() => onPanel('export')}>
          <Download size={24} strokeWidth={2.2} />
          <span>{copy.settings.exportData}</span>
          <ChevronRight size={24} strokeWidth={2.2} />
        </button>
        <button onClick={() => onPanel('emotion-map-mcp')}>
          <KeyRound size={24} strokeWidth={2.2} />
          <span>{copy.settings.emotionMapMcp}</span>
          <ChevronRight size={24} strokeWidth={2.2} />
        </button>
      </div>
    </section>
  );
}
