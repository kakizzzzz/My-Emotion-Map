import { useEffect, useState } from 'react';
import { Bot, Cable, Check, Download, Upload } from 'lucide-react';
import { useAppLanguage } from '../../i18n';
import type { HealthPreferences } from '../../types';
import type { McpProposal } from './settingsTypes';

const STYLES = ['concise', 'direct', 'gentle'] as const;

export function AiSettingsPanel({
  styles,
  onStyles,
  onTestAutomation,
  onIssueToken,
  onRevokeTokens,
  healthPreferences,
  onHealthPreferences,
  onIssueShortcutPairing,
  onListMcpProposals,
  onResolveMcpProposal,
}: {
  styles: string[];
  onStyles: (styles: string[]) => void;
  onTestAutomation: () => void;
  onIssueToken: (
    kind: 'input' | 'output',
  ) => Promise<{ token: string; expiresAt: string } | null>;
  onRevokeTokens: () => Promise<boolean>;
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
}) {
  const { copy } = useAppLanguage();
  const [accessToken, setAccessToken] = useState('');
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

  const issue = async (kind: 'input' | 'output') => {
    if (busy) return;
    setBusy(true);
    const issued = await onIssueToken(kind);
    setAccessToken(issued?.token ?? '');
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
            <strong>{copy.settings.aiStyle}</strong>
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

      {([
        ['input', copy.settings.aiRead, Download],
        ['output', copy.settings.aiOperate, Upload],
      ] as const).map(([kind, label, Icon]) => (
        <article key={kind} className="connection-card is-open">
          <div className="connection-card__header">
            <span className="connection-card__icon">
              <Icon size={22} strokeWidth={2.2} />
            </span>
            <span className="connection-card__title"><strong>{label}</strong></span>
          </div>
          <div className="connection-card__body">
            <button
              className="connection-check-button"
              onClick={() => void issue(kind)}
              disabled={busy}
            >
              {copy.settings.createAccess}
            </button>
          </div>
        </article>
      ))}

      {accessToken ? (
        <article className="connection-card is-open mcp-token-card">
          <div className="connection-card__header">
            <span className="connection-card__title">
              <strong>{copy.settings.accessReady}</strong>
            </span>
          </div>
          <div className="connection-card__body">
            <code>{accessToken}</code>
            <button
              className="connection-check-button"
              onClick={() => void navigator.clipboard.writeText(accessToken)}
            >
              {copy.settings.copyAccess}
            </button>
          </div>
        </article>
      ) : null}

      <button
        className="connection-check-button"
        onClick={async () => {
          if (await onRevokeTokens()) setAccessToken('');
        }}
      >
        {copy.settings.revokeAccess}
      </button>

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
              singleSampleEnabled: false,
            })}
          >
            {copy.settings.confirmRange}
          </button>
          {shortcutInstallUrl ? (
            <a
              className="connection-check-button"
              href={shortcutInstallUrl}
              target="_blank"
              rel="noreferrer"
            >
              {copy.settings.installAutomation}
            </a>
          ) : null}
          <button
            className="connection-check-button"
            disabled={busy || !healthPreferences.rangeConfirmed}
            onClick={async () => {
              setBusy(true);
              const pairing = await onIssueShortcutPairing();
              setAccessToken(pairing?.token ?? '');
              setBusy(false);
            }}
          >
            {copy.settings.pairAutomation}
          </button>
          <button className="connection-check-button" onClick={onTestAutomation}>
            {copy.settings.testAutomation}
          </button>
        </div>
      </article>
    </section>
  );
}
