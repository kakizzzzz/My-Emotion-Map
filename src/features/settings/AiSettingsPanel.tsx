import { useEffect, useState } from 'react';
import { Bot, Cable, Check, ChevronRight, Link2 } from 'lucide-react';
import { useAppLanguage } from '../../i18n';
import type { HealthPreferences } from '../../types';
import type {
  ShortcutConnectionStatus,
  ShortcutPairing,
  ShortcutTestResult,
} from '../../domain/shortcutConnection';
import type { MyLifeMemoryConnectionStatus } from '../../services/myLifeMemoryConnection';
import type { SettingsPanel } from './settingsTypes';

const STYLES = ['concise', 'direct', 'gentle', 'sharp'] as const;

type AiPanelMode = Extract<
  SettingsPanel,
  'ai' | 'my-life-memory-mcp' | 'health-automation'
>;

export function AiSettingsPanel({
  mode,
  styles,
  userPrompt,
  onStyles,
  onUserPrompt,
  onPanel,
  onTestShortcutPairing,
  onConnectMyLifeMemory,
  onTestMyLifeMemory,
  onGetMyLifeMemoryStatus,
  onDisconnectMyLifeMemory,
  healthPreferences,
  onHealthPreferences,
  onIssueShortcutPairing,
  onGetShortcutConnectionStatus,
  onRevokeShortcutTokens,
}: {
  mode: AiPanelMode;
  styles: string[];
  userPrompt: string;
  onStyles: (styles: string[]) => void;
  onUserPrompt: (value: string) => void;
  onPanel: (panel: SettingsPanel) => void;
  onTestShortcutPairing: (token: string) => Promise<ShortcutTestResult>;
  onConnectMyLifeMemory: (token: string) => Promise<MyLifeMemoryConnectionStatus | null>;
  onTestMyLifeMemory: () => Promise<MyLifeMemoryConnectionStatus | null>;
  onGetMyLifeMemoryStatus: () => Promise<MyLifeMemoryConnectionStatus | null>;
  onDisconnectMyLifeMemory: () => Promise<MyLifeMemoryConnectionStatus | null>;
  healthPreferences: HealthPreferences;
  onHealthPreferences: (preferences: HealthPreferences) => boolean;
  onIssueShortcutPairing: () => Promise<ShortcutPairing | null>;
  onGetShortcutConnectionStatus: () => Promise<ShortcutConnectionStatus>;
  onRevokeShortcutTokens: () => Promise<boolean>;
}) {
  const { copy } = useAppLanguage();
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
    if (mode !== 'health-automation') return;
    let active = true;
    void onGetShortcutConnectionStatus().then((status) => {
      if (active) setShortcutStatus(status);
    });
    return () => { active = false; };
  }, [mode, onGetShortcutConnectionStatus]);

  useEffect(() => {
    if (mode !== 'my-life-memory-mcp') return;
    let active = true;
    void onGetMyLifeMemoryStatus().then((status) => {
      if (active) setMyLifeMemoryStatus(status);
    });
    return () => { active = false; };
  }, [mode, onGetMyLifeMemoryStatus]);

  if (mode === 'ai') {
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
                  onClick={() => onStyles(
                    selected
                      ? styles.filter((item) => item !== style)
                      : [...styles, style].slice(0, 3),
                  )}
                >
                  {selected ? <Check size={16} strokeWidth={2.2} /> : null}
                  {copy.settings.aiStyles[style]}
                </button>
              );
            })}
          </div>
        </article>

        <article className="connection-card is-open ai-user-prompt-card">
          <label htmlFor="ai-user-prompt">{copy.settings.userPrompt}</label>
          <textarea
            id="ai-user-prompt"
            value={userPrompt}
            maxLength={240}
            placeholder={copy.settings.userPromptPlaceholder}
            onChange={(event) => onUserPrompt(event.target.value)}
          />
          <small>{copy.settings.userPromptHint}</small>
        </article>

        <div className="settings-submenu ai-settings-links">
          <button onClick={() => onPanel('my-life-memory-mcp')}>
            <Link2 size={24} strokeWidth={2.2} />
            <span>{copy.settings.myLifeMemoryMcp}</span>
            <ChevronRight size={24} strokeWidth={2.2} />
          </button>
          <button onClick={() => onPanel('health-automation')}>
            <Cable size={24} strokeWidth={2.2} />
            <span>{copy.settings.healthAutomation}</span>
            <ChevronRight size={24} strokeWidth={2.2} />
          </button>
        </div>
      </section>
    );
  }

  if (mode === 'my-life-memory-mcp') {
    return (
      <section className="connections-card-list my-life-memory-mcp-panel">
        <article className="mcp-access-card">
          <header>
            <Link2 size={24} strokeWidth={2.2} />
            <strong>{copy.settings.mcpConfiguration}</strong>
          </header>
          <div className="mcp-identity-grid">
            <div>
              <small>{copy.settings.mcpNameLabel}</small>
              <strong>My Life Memory</strong>
            </div>
            <div>
              <small>{copy.settings.mcpTransportLabel}</small>
              <strong>{copy.settings.mcpTransportValue}</strong>
            </div>
          </div>
          <small className="mcp-connection-hint">
            {copy.settings.myLifeMemoryMcpHint}
          </small>
          {myLifeMemoryStatus?.state !== 'connected' ? (
            <input
              className="mcp-token-input"
              type="password"
              value={myLifeMemoryToken}
              maxLength={1024}
              autoComplete="off"
              spellCheck={false}
              aria-label={copy.settings.myLifeMemoryMcpToken}
              placeholder={copy.settings.myLifeMemoryMcpToken}
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
          <small role="status" className="mcp-feedback">
            {myLifeMemoryFeedback
              ? copy.settings.myLifeMemoryFeedback[myLifeMemoryFeedback]
              : copy.settings.myLifeMemoryStatus[
                  myLifeMemoryStatus?.state ?? 'disconnected'
                ]}
          </small>
          {myLifeMemoryStatus?.lastTestAt ? (
            <small className="mcp-last-tested">
              {copy.settings.connectionLastTest}{' '}
              {new Date(myLifeMemoryStatus.lastTestAt).toLocaleString()}
            </small>
          ) : null}
        </article>
      </section>
    );
  }

  return (
    <section className="connections-card-list health-automation-panel">
      <article className="connection-card is-open">
        <div className="connection-card__header">
          <span className="connection-card__icon">
            <Cable size={22} strokeWidth={2.2} />
          </span>
          <span className="connection-card__title">
            <strong>{copy.settings.healthAutomation}</strong>
          </span>
        </div>
        <div className="connection-card__body automation-settings">
          <p className="automation-intro">
            {copy.settings.healthAutomationIntro}
          </p>
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

          <section className="automation-step">
            <strong><i>1</i>{copy.settings.automationStepInstall}</strong>
            <small>{copy.settings.automationInstallHint}</small>
            {shortcutInstallUrl ? (
              <a
                className="connection-check-button"
                href={shortcutInstallUrl}
                target="_blank"
                rel="noreferrer"
              >
                {copy.settings.installAutomation}
              </a>
            ) : (
              <small className="automation-unavailable" role="status">
                {copy.settings.shortcutInstallUnavailable}
              </small>
            )}
          </section>

          <section className="automation-step">
            <strong><i>2</i>{copy.settings.automationStepRange}</strong>
            <small>{copy.settings.automationRangeHint}</small>
            <fieldset className="health-range-inputs">
              <label>
                <span>{copy.settings.heartRateMin}</span>
                <input
                  type="number"
                  min={35}
                  max={180}
                  value={rangeMin}
                  aria-label={copy.settings.heartRateMin}
                  onChange={(event) => setRangeMin(Number(event.target.value))}
                />
              </label>
              <label>
                <span>{copy.settings.heartRateMax}</span>
                <input
                  type="number"
                  min={40}
                  max={220}
                  value={rangeMax}
                  aria-label={copy.settings.heartRateMax}
                  onChange={(event) => setRangeMax(Number(event.target.value))}
                />
              </label>
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
          </section>

          <section className="automation-step">
            <strong><i>3</i>{copy.settings.automationStepPair}</strong>
            <small>{copy.settings.automationPairHint}</small>
            <button
              className="connection-check-button"
              disabled={busy || !shortcutInstallUrl || !healthPreferences.rangeConfirmed}
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
          </section>

          <section className="automation-step">
            <strong><i>4</i>{copy.settings.automationStepTest}</strong>
            <small>{copy.settings.automationTestHint}</small>
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
            <small>{copy.settings.shortcutAutomationGuide}</small>
          </section>

          <details className="automation-advanced">
            <summary>{copy.settings.automationAdvanced}</summary>
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
          </details>

          {shortcutStatus?.state && shortcutStatus.state !== 'disconnected' ? (
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
          ) : null}
        </div>
      </article>
    </section>
  );
}
