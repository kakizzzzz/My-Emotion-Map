import { useEffect, useState } from 'react';
import { Bot, Cable, Check, Link2, Upload } from 'lucide-react';
import { useAppLanguage } from '../../i18n';
import type { HealthPreferences } from '../../types';
import type { McpProposal } from './settingsTypes';
import type {
  ShortcutConnectionStatus,
  ShortcutPairing,
  ShortcutTestResult,
} from '../../domain/shortcutConnection';
import type { MyLifeMemoryConnectionStatus } from '../../services/myLifeMemoryConnection';

const STYLES = ['concise', 'direct', 'gentle'] as const;

export function AiSettingsPanel({
  styles,
  onStyles,
  onTestShortcutPairing,
  onIssueToken,
  onRevokeTokens,
  onConnectMyLifeMemory,
  onTestMyLifeMemory,
  onGetMyLifeMemoryStatus,
  onDisconnectMyLifeMemory,
  healthPreferences,
  onHealthPreferences,
  onIssueShortcutPairing,
  onGetShortcutConnectionStatus,
  onRevokeShortcutTokens,
  onListMcpProposals,
  onResolveMcpProposal,
}: {
  styles: string[];
  onStyles: (styles: string[]) => void;
  onTestShortcutPairing: (token: string) => Promise<ShortcutTestResult>;
  onIssueToken: () => Promise<{ token: string; expiresAt: string } | null>;
  onRevokeTokens: () => Promise<boolean>;
  onConnectMyLifeMemory: (token: string) => Promise<MyLifeMemoryConnectionStatus | null>;
  onTestMyLifeMemory: () => Promise<MyLifeMemoryConnectionStatus | null>;
  onGetMyLifeMemoryStatus: () => Promise<MyLifeMemoryConnectionStatus | null>;
  onDisconnectMyLifeMemory: () => Promise<MyLifeMemoryConnectionStatus | null>;
  healthPreferences: HealthPreferences;
  onHealthPreferences: (preferences: HealthPreferences) => boolean;
  onIssueShortcutPairing: () => Promise<ShortcutPairing | null>;
  onGetShortcutConnectionStatus: () => Promise<ShortcutConnectionStatus>;
  onRevokeShortcutTokens: () => Promise<boolean>;
  onListMcpProposals: () => Promise<McpProposal[]>;
  onResolveMcpProposal: (
    proposal: McpProposal,
    decision: 'accepted' | 'rejected',
  ) => Promise<boolean>;
}) {
  const { copy } = useAppLanguage();
  const [outputToken, setOutputToken] = useState<{
    token: string; expiresAt: string;
  } | null>(null);
  const [myLifeMemoryToken, setMyLifeMemoryToken] = useState('');
  const [myLifeMemoryStatus, setMyLifeMemoryStatus] =
    useState<MyLifeMemoryConnectionStatus | null>(null);
  const [myLifeMemoryFeedback, setMyLifeMemoryFeedback] = useState<
    'connected' | 'tested' | 'disconnected' | 'unavailable' | null
  >(null);
  const [shortcutPairing, setShortcutPairing] = useState<ShortcutPairing | null>(null);
  const [shortcutStatus, setShortcutStatus] = useState<ShortcutConnectionStatus | null>(null);
  const [shortcutTestResult, setShortcutTestResult] = useState<ShortcutTestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [proposals, setProposals] = useState<McpProposal[]>([]);
  const [rangeMin, setRangeMin] = useState(
    healthPreferences.restingHeartRateMin,
  );
  const [rangeMax, setRangeMax] = useState(
    healthPreferences.restingHeartRateMax,
  );
  const configuredShortcutUrl = (
    import.meta.env.VITE_SHORTCUT_INSTALL_URL as string | undefined
  )?.trim() ?? '';
  const shortcutInstallUrl = /^https:\/\/www\.icloud\.com\/shortcuts\//.test(
    configuredShortcutUrl,
  ) ? configuredShortcutUrl : '';

  useEffect(() => {
    let active = true;
    void onListMcpProposals().then((items) => {
      if (active) setProposals(items);
    });
    return () => { active = false; };
  }, [onListMcpProposals]);

  useEffect(() => {
    let active = true;
    void onGetShortcutConnectionStatus().then((status) => {
      if (active) setShortcutStatus(status);
    });
    return () => { active = false; };
  }, [onGetShortcutConnectionStatus]);

  useEffect(() => {
    let active = true;
    void onGetMyLifeMemoryStatus().then((status) => {
      if (active) setMyLifeMemoryStatus(status);
    });
    return () => { active = false; };
  }, [onGetMyLifeMemoryStatus]);

  const issue = async () => {
    if (busy) return;
    setBusy(true);
    const issued = await onIssueToken();
    if (issued) setOutputToken(issued);
    setBusy(false);
  };
  return (
    <section className="connections-card-list ai-settings-panel">
      <article className="connection-card is-open">
        <div className="connection-card__header">
          <span className="connection-card__icon">
            <Bot size={22} strokeWidth={2.2} />
          </span>
          <span className="connection-card__title">
            <strong>{copy.settings.assistant}</strong>
          </span>
        </div>
        <div className="connection-card__body ai-style-options">
          {STYLES.map((style) => {
            const selected = styles.includes(style);
            return (
              <button
                key={style}
                className={selected ? 'is-selected' : ''}
                aria-pressed={selected}
                onClick={() =>
                  onStyles(
                    selected
                      ? styles.filter((item) => item !== style)
                      : [...styles, style].slice(0, 3),
                  )
                }
              >
                {selected ? <Check size={16} strokeWidth={2.2} /> : null}
                {copy.settings.aiStyles[style]}
              </button>
            );
          })}
        </div>
      </article>

      <article className="connection-card is-open">
        <div className="connection-card__header">
          <span className="connection-card__icon">
            <Link2 size={22} strokeWidth={2.2} />
          </span>
          <span className="connection-card__title">
            <strong>{copy.settings.myLifeMemory}</strong>
            <small>{copy.settings.myLifeMemoryStatus[
              myLifeMemoryStatus?.state ?? 'disconnected'
            ]}</small>
          </span>
        </div>
        <div className="connection-card__body my-life-memory-connection">
          {myLifeMemoryStatus?.state !== 'connected' ? (
            <input
              type="password"
              value={myLifeMemoryToken}
              maxLength={1024}
              autoComplete="off"
              spellCheck={false}
              aria-label={copy.settings.myLifeMemoryToken}
              placeholder={copy.settings.myLifeMemoryToken}
              onChange={(event) => setMyLifeMemoryToken(event.target.value)}
            />
          ) : null}
          <div className="connection-action-row">
            {myLifeMemoryStatus?.state !== 'connected' ? (
              <button
                className="connection-check-button"
                disabled={busy || myLifeMemoryToken.trim().length < 20}
                onClick={async () => {
                  const token = myLifeMemoryToken.trim();
                  setBusy(true);
                  setMyLifeMemoryToken('');
                  const status = await onConnectMyLifeMemory(token);
                  setMyLifeMemoryStatus(status);
                  setMyLifeMemoryFeedback(status?.state === 'connected'
                    ? 'connected' : 'unavailable');
                  setBusy(false);
                }}
              >
                {copy.settings.connect}
              </button>
            ) : (
              <button
                className="connection-check-button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const status = await onTestMyLifeMemory();
                  setMyLifeMemoryStatus(status);
                  setMyLifeMemoryFeedback(status?.state === 'connected'
                    ? 'tested' : 'unavailable');
                  setBusy(false);
                }}
              >
                {copy.settings.testConnection}
              </button>
            )}
            <button
              className="connection-check-button"
              disabled={busy || !myLifeMemoryStatus ||
                myLifeMemoryStatus.state === 'disconnected'}
              onClick={async () => {
                setBusy(true);
                const status = await onDisconnectMyLifeMemory();
                setMyLifeMemoryStatus(status);
                setMyLifeMemoryFeedback(status?.state === 'disconnected'
                  ? 'disconnected' : 'unavailable');
                setBusy(false);
              }}
            >
              {copy.settings.disconnect}
            </button>
          </div>
          {myLifeMemoryFeedback ? (
            <small role="status">
              {copy.settings.myLifeMemoryFeedback[myLifeMemoryFeedback]}
            </small>
          ) : null}
          {myLifeMemoryStatus?.lastTestAt ? (
            <small>
              {copy.settings.connectionLastTest}{' '}
              {new Date(myLifeMemoryStatus.lastTestAt).toLocaleString()}
            </small>
          ) : null}
        </div>
      </article>

      <article className="connection-card is-open">
        <div className="connection-card__header">
          <span className="connection-card__icon">
            <Upload size={22} strokeWidth={2.2} />
          </span>
          <span className="connection-card__title">
            <strong>{copy.settings.externalAccess}</strong>
          </span>
        </div>
        <div className="connection-card__body">
          <button
            className="connection-check-button"
            onClick={() => void issue()}
            disabled={busy}
          >
            {copy.settings.createAccess}
          </button>
          {outputToken ? (
            <div className="connection-token-once">
              <small>{copy.settings.accessReady}</small>
              <code>{outputToken.token}</code>
              <button
                className="connection-check-button"
                onClick={() => void navigator.clipboard.writeText(outputToken.token)}
              >
                {copy.settings.copyAccess}
              </button>
            </div>
          ) : null}
          <button
            className="connection-check-button"
            onClick={async () => {
              if (await onRevokeTokens()) setOutputToken(null);
            }}
          >
            {copy.settings.revokeAccess}
          </button>
        </div>
      </article>

      {proposals.length ? (
        <article className="connection-card is-open mcp-proposal-card">
          <div className="connection-card__header">
            <span className="connection-card__title">
              <strong>{copy.settings.pendingActions}</strong>
            </span>
          </div>
          <div className="connection-card__body mcp-proposal-list">
            {proposals.map((proposal) => {
              const summary = typeof proposal.payload.title === 'string'
                ? proposal.payload.title
                : typeof proposal.payload.text === 'string'
                  ? proposal.payload.text
                  : '';
              return (
                <div key={proposal.id} className="mcp-proposal-row">
                  <p>
                    <strong>{copy.settings.proposalKinds[
                      proposal.toolName.includes('append_note')
                        ? 'append'
                        : proposal.toolName.includes('schedule_followup')
                          ? 'followup'
                          : 'draft'
                    ]}</strong>
                    {summary ? <span>{summary.slice(0, 120)}</span> : null}
                  </p>
                  <div>
                    {(['rejected', 'accepted'] as const).map((decision) => (
                      <button
                        key={decision}
                        type="button"
                        className="connection-check-button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          if (await onResolveMcpProposal(proposal, decision)) {
                            setProposals((current) => current.filter(
                              (item) => item.id !== proposal.id,
                            ));
                          }
                          setBusy(false);
                        }}
                      >
                        {decision === 'accepted'
                          ? copy.settings.acceptAction
                          : copy.settings.rejectAction}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      ) : null}

      <article className="connection-card is-open">
        <div className="connection-card__header">
          <span className="connection-card__icon">
            <Cable size={22} strokeWidth={2.2} />
          </span>
          <span className="connection-card__title">
            <strong>{copy.settings.automation}</strong>
          </span>
        </div>
        <div className="connection-card__body automation-settings">
          <div className="shortcut-connection-status" role="status">
            <strong>{copy.settings.shortcutStatus[
              shortcutStatus?.state ?? 'disconnected'
            ]}</strong>
            {shortcutStatus?.lastReceivedAt ? (
              <small>
                {copy.settings.shortcutLastReceived}{' '}
                {new Date(shortcutStatus.lastReceivedAt).toLocaleString()}
              </small>
            ) : null}
            {shortcutStatus?.lastTestAt ? (
              <small>
                {copy.settings.shortcutLastTest}{' '}
                {new Date(shortcutStatus.lastTestAt).toLocaleString()}
              </small>
            ) : null}
            {shortcutStatus?.expiresAt ? (
              <small>
                {copy.settings.shortcutExpires}{' '}
                {new Date(shortcutStatus.expiresAt).toLocaleDateString()}
              </small>
            ) : null}
            {shortcutStatus?.algorithmVersion || shortcutStatus?.shortcutVersion ? (
              <small>
                {[shortcutStatus.shortcutVersion, shortcutStatus.algorithmVersion]
                  .filter(Boolean).join(' · ')}
              </small>
            ) : null}
          </div>
          <fieldset>
            <legend>{copy.settings.healthRange}</legend>
            <input
              type="number"
              min={35}
              max={180}
              value={rangeMin}
              aria-label={`${copy.settings.healthRange} min`}
              onChange={(event) => setRangeMin(Number(event.target.value))}
            />
            <input
              type="number"
              min={40}
              max={220}
              value={rangeMax}
              aria-label={`${copy.settings.healthRange} max`}
              onChange={(event) => setRangeMax(Number(event.target.value))}
            />
          </fieldset>
          <button
            className="connection-check-button"
            disabled={rangeMin < 35 || rangeMax > 220 || rangeMin >= rangeMax}
            onClick={() => onHealthPreferences({
              ...healthPreferences,
              restingHeartRateMin: Math.round(rangeMin),
              restingHeartRateMax: Math.round(rangeMax),
              rangeConfirmed: true,
            }) && setShortcutPairing(null)}
          >
            {copy.settings.confirmRange}
          </button>
          <div className="automation-policy-options">
            <button
              type="button"
              aria-pressed={healthPreferences.singleSampleEnabled}
              onClick={() => {
                onHealthPreferences({
                  ...healthPreferences,
                  singleSampleEnabled: !healthPreferences.singleSampleEnabled,
                });
                setShortcutPairing(null);
              }}
            >
              {copy.settings.shortcutSingleSample}
            </button>
            <button
              type="button"
              aria-pressed={healthPreferences.workoutPolicy === 'post_workout_review'}
              onClick={() => {
                onHealthPreferences({
                  ...healthPreferences,
                  workoutPolicy: healthPreferences.workoutPolicy === 'suppress'
                    ? 'post_workout_review'
                    : 'suppress',
                });
                setShortcutPairing(null);
              }}
            >
              {copy.settings.shortcutWorkoutReview}
            </button>
            <button
              type="button"
              aria-pressed={healthPreferences.unknownPolicy === 'strict_review'}
              onClick={() => {
                onHealthPreferences({
                  ...healthPreferences,
                  unknownPolicy: healthPreferences.unknownPolicy === 'suppress'
                    ? 'strict_review'
                    : 'suppress',
                });
                setShortcutPairing(null);
              }}
            >
              {copy.settings.shortcutUnknownReview}
            </button>
          </div>
          <small>{copy.settings.shortcutPolicyHint}</small>
          <small className="shortcut-step-label">1 · {copy.settings.shortcutSteps.install}</small>
          {shortcutInstallUrl ? (
            <a
              className="connection-check-button"
              href={shortcutInstallUrl}
              target="_blank"
              rel="noreferrer"
            >
              {copy.settings.installAutomation}
            </a>
          ) : <small>{copy.settings.shortcutInstallUnavailable}</small>}
          <small className="shortcut-step-label">2 · {copy.settings.shortcutSteps.pair}</small>
          <button
            className="connection-check-button"
            disabled={busy || !healthPreferences.rangeConfirmed}
            onClick={async () => {
              setBusy(true);
              const pairing = await onIssueShortcutPairing();
              setShortcutPairing(pairing);
              setShortcutTestResult(null);
              if (pairing) {
                setShortcutStatus({
                  state: 'paired',
                  expiresAt: pairing.expiresAt,
                  lastReceivedAt: null,
                  lastTestAt: null,
                  shortcutVersion: pairing.shortcutVersion,
                  algorithmVersion: pairing.algorithmVersion,
                });
              }
              setBusy(false);
            }}
          >
            {copy.settings.pairAutomation}
          </button>
          {shortcutPairing ? (
            <div className="connection-token-once shortcut-pairing-token">
              <small>{copy.settings.shortcutPairingShownOnce}</small>
              <code>{shortcutPairing.token}</code>
              <button
                className="connection-check-button"
                onClick={() => void navigator.clipboard.writeText(shortcutPairing.token)}
              >
                {copy.settings.copyAccess}
              </button>
            </div>
          ) : null}
          <small className="shortcut-step-label">3 · {copy.settings.shortcutSteps.verify}</small>
          <button
            className="connection-check-button"
            disabled={busy || !shortcutPairing}
            onClick={async () => {
              if (!shortcutPairing) return;
              setBusy(true);
              const result = await onTestShortcutPairing(shortcutPairing.token);
              setShortcutTestResult(result);
              if (result === 'verified') {
                setShortcutStatus(await onGetShortcutConnectionStatus());
              }
              setBusy(false);
            }}
          >
            {copy.settings.testAutomation}
          </button>
          {shortcutTestResult ? (
            <small role="status">
              {copy.settings.shortcutTestResult[shortcutTestResult]}
            </small>
          ) : null}
          <small className="shortcut-step-label">4 · {copy.settings.shortcutSteps.automate}</small>
          <small>{copy.settings.shortcutAutomationGuide}</small>
          <button
            className="connection-check-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              if (await onRevokeShortcutTokens()) {
                setShortcutPairing(null);
                setShortcutStatus((current) => ({
                  state: 'disconnected',
                  expiresAt: current?.expiresAt ?? null,
                  lastReceivedAt: current?.lastReceivedAt ?? null,
                  lastTestAt: current?.lastTestAt ?? null,
                  shortcutVersion: current?.shortcutVersion ?? null,
                  algorithmVersion: current?.algorithmVersion ?? null,
                }));
              }
              setBusy(false);
            }}
          >
            {copy.settings.shortcutDisconnect}
          </button>
        </div>
      </article>
    </section>
  );
}
