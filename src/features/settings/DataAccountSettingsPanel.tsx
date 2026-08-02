import { Cloud, Download, Languages, MapPin } from 'lucide-react';
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
  return (
    <section className="connections-card-list data-account-panel">
      <article className="connection-card is-open">
        <div className="connection-card__header">
          <span className="connection-card__icon">
            <Cloud size={22} strokeWidth={2.2} />
          </span>
          <span className="connection-card__title">
            <strong>{copy.settings.cloudTitle}</strong>
          </span>
          <span className="connection-status">
            {copy.settings.cloudStatus[cloudStatus]}
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
      <div className="settings-submenu">
        <button onClick={() => onPanel('language')}>
          <Languages size={24} strokeWidth={2.2} />
          <span>{copy.settings.language}</span>
        </button>
        <button onClick={() => onPanel('location')}>
          <MapPin size={24} strokeWidth={2.2} />
          <span>{copy.location.settingsTitle}</span>
        </button>
        <button onClick={() => onPanel('export')}>
          <Download size={24} strokeWidth={2.2} />
          <span>{copy.settings.exportData}</span>
        </button>
        <button onClick={() => onPanel('data')}>
          <Download size={24} strokeWidth={2.2} />
          <span>{copy.settings.dataManagement}</span>
        </button>
      </div>
    </section>
  );
}
