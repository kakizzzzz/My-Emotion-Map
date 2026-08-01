import { useState, type FormEvent } from 'react';
import { Cloud, HeartPulse, LogOut, Mail, Smartphone } from 'lucide-react';
import { useAppLanguage } from '../../i18n';
import type { CloudSyncStatus } from '../../services/useCloudSync';

export function PlannedFeaturePanel({
  feature,
  cloudConfigured,
  cloudEmail,
  cloudStatus,
  onRequestMagicLink,
  onSignOut,
  onConfirmInitialUpload,
  onUseRemoteVersion,
  onOverwriteRemote,
}: {
  feature: 'connections' | 'health';
  cloudConfigured: boolean;
  cloudEmail: string | null;
  cloudStatus: CloudSyncStatus;
  onRequestMagicLink: (email: string) => Promise<boolean>;
  onSignOut: () => Promise<unknown>;
  onConfirmInitialUpload: () => void;
  onUseRemoteVersion: () => void;
  onOverwriteRemote: () => void;
}) {
  const { copy } = useAppLanguage();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

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
            <span className="connection-status">{copy.common.planned}</span>
          </div>
          <div className="connection-card__body"><p className="settings-honesty-note">{copy.health.notConnected}</p></div>
        </article>
      </section>
    );
  }

  const statusLabel = copy.settings.cloudStatus[cloudStatus];
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail || busy) return;
    setBusy(true);
    setSent(await onRequestMagicLink(normalizedEmail));
    setBusy(false);
  };

  return (
    <section className="connections-card-list">
      <article className="connection-card is-open">
        <div className="connection-card__header">
          <span className="connection-card__icon"><Smartphone size={22} strokeWidth={2.2} /></span>
          <span className="connection-card__title">
            <strong>{copy.settings.connectionsLabels.iosShortcuts}</strong>
            <small>{copy.settings.connectionsLabels.healthTransfer}</small>
          </span>
          <span className="connection-status">{copy.common.experimental}</span>
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
          ) : cloudEmail ? (
            <>
              <p className="settings-honesty-note">{cloudEmail}</p>
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
              <button className="connection-check-button" onClick={() => void onSignOut()}>
                <LogOut size={18} strokeWidth={2.2} />{copy.settings.signOut}
              </button>
            </>
          ) : (
            <form className="cloud-login-form" onSubmit={(event) => void submit(event)}>
              <label>
                <span>{copy.settings.emailLabel}</span>
                <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <button type="submit" disabled={busy || !email.trim()}>
                <Mail size={18} strokeWidth={2.2} />
                {busy ? copy.settings.sendingLink : copy.settings.sendMagicLink}
              </button>
              {sent ? <p role="status">{copy.settings.magicLinkSent}</p> : null}
            </form>
          )}
        </div>
      </article>
    </section>
  );
}
