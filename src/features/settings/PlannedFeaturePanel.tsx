import { Cloud, HeartPulse, Smartphone } from 'lucide-react';
import { useAppLanguage } from '../../i18n';
import type { CloudSyncStatus } from '../../services/useCloudSync';

export function PlannedFeaturePanel({
  feature,
  cloudConfigured,
  cloudAccount,
  cloudStatus,
  onConfirmInitialUpload,
  onUseRemoteVersion,
  onOverwriteRemote,
}: {
  feature: 'connections' | 'health';
  cloudConfigured: boolean;
  cloudAccount: string | null;
  cloudStatus: CloudSyncStatus;
  onConfirmInitialUpload: () => void;
  onUseRemoteVersion: () => void;
  onOverwriteRemote: () => void;
}) {
  const { copy } = useAppLanguage();

  if (feature === 'health') {
    return (
      <section className="connections-card-list">
        <article className="connection-card is-open">
          <div className="connection-card__header">
            <span className="connection-card__icon"><HeartPulse size={22} strokeWidth={2.2} /></span>
            <span className="connection-card__title">
              <strong>{copy.settings.health}</strong>
              <small>{copy.health.plannedDescription}</small>
            </span>
            <span className="connection-status">{copy.settings.manualTransfer}</span>
          </div>
          <div className="connection-card__body"><p className="settings-honesty-note">{copy.health.notConnected}</p></div>
        </article>
      </section>
    );
  }

  const statusLabel = copy.settings.cloudStatus[cloudStatus];

  return (
    <section className="connections-card-list">
      <article className="connection-card is-open">
        <div className="connection-card__header">
          <span className="connection-card__icon"><Smartphone size={22} strokeWidth={2.2} /></span>
          <span className="connection-card__title">
            <strong>{copy.settings.connectionsLabels.iosShortcuts}</strong>
            <small>{copy.settings.connectionsLabels.healthTransfer}</small>
          </span>
          <span className="connection-status">{copy.settings.manualTransfer}</span>
        </div>
        <div className="connection-card__body"><p className="settings-honesty-note">{copy.settings.shortcutNotConnected}</p></div>
      </article>

      <article className="connection-card is-open">
        <div className="connection-card__header">
          <span className="connection-card__icon"><Cloud size={22} strokeWidth={2.2} /></span>
          <span className="connection-card__title">
            <strong>{copy.settings.cloudTitle}</strong>
            <small>{copy.settings.cloudSubtitle}</small>
          </span>
          <span className="connection-status">{statusLabel}</span>
        </div>
        <div className="connection-card__body">
          {!cloudConfigured ? (
            <p className="settings-honesty-note">{copy.settings.cloudNotConfigured}</p>
          ) : cloudAccount ? (
            <>
              <p className="settings-honesty-note">
                {copy.settings.cloudAccountLabel}: {cloudAccount}
              </p>
              <p className="settings-honesty-note">{copy.settings.cloudStatusHint[cloudStatus]}</p>
              {cloudStatus === 'upload_confirmation_required' ? (
                <button className="connection-check-button" onClick={onConfirmInitialUpload}>
                  <Cloud size={18} strokeWidth={2.2} />{copy.settings.cloudConfirmInitialUpload}
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
            </>
          ) : (
            <p className="settings-honesty-note">
              {copy.settings.cloudSessionMissing}
            </p>
          )}
        </div>
      </article>
    </section>
  );
}
