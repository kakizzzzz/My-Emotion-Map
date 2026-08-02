import { useEffect, useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { useAppLanguage } from '../../i18n';
import { getSupabaseFunctionUrl } from '../../services/supabaseClient';
import type { McpOutputStatus } from '../../services/externalAccess';
import type { McpProposal } from './settingsTypes';

export function EmotionMapMcpPanel({
  onIssueToken,
  onGetStatus,
  onRevokeTokens,
  onListProposals,
  onResolveProposal,
}: {
  onIssueToken: () => Promise<{ token: string; expiresAt: string } | null>;
  onGetStatus: () => Promise<McpOutputStatus | null>;
  onRevokeTokens: () => Promise<boolean>;
  onListProposals: () => Promise<McpProposal[]>;
  onResolveProposal: (
    proposal: McpProposal,
    decision: 'accepted' | 'rejected',
  ) => Promise<boolean>;
}) {
  const { copy } = useAppLanguage();
  const [plainToken, setPlainToken] = useState('');
  const [status, setStatus] = useState<McpOutputStatus | null>(null);
  const [proposals, setProposals] = useState<McpProposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<
    'ready' | 'copied' | 'revoked' | 'failed' | null
  >(null);
  const endpoint = getSupabaseFunctionUrl('emotion-map-mcp');
  const headerValue = plainToken
    ? `Bearer ${plainToken}`
    : copy.settings.mcpHeaderValueHint;

  useEffect(() => {
    let active = true;
    void Promise.all([onGetStatus(), onListProposals()]).then(
      ([nextStatus, nextProposals]) => {
        if (!active) return;
        setStatus(nextStatus);
        setProposals(nextProposals);
      },
    );
    return () => { active = false; };
  }, [onGetStatus, onListProposals]);

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback('copied');
    } catch {
      setFeedback('failed');
    }
  };

  const issue = async () => {
    if (busy) return;
    setBusy(true);
    setPlainToken('');
    setFeedback(null);
    const issued = await onIssueToken();
    if (issued) {
      setPlainToken(issued.token);
      setStatus({
        scope: 'records:read',
        expiresAt: issued.expiresAt,
        lastUsedAt: null,
      });
      setFeedback('ready');
    } else {
      setFeedback('failed');
    }
    setBusy(false);
  };

  return (
    <section className="connections-card-list emotion-map-mcp-panel">
      <article className="mcp-access-card">
        <header>
          <KeyRound size={24} strokeWidth={2.2} />
          <strong>{copy.settings.mcpAccess}</strong>
        </header>

        <div className="mcp-identity-grid">
          <div>
            <small>{copy.settings.mcpNameLabel}</small>
            <strong>My Emotion Map</strong>
          </div>
          <div>
            <small>{copy.settings.mcpTransportLabel}</small>
            <strong>{copy.settings.mcpTransportValue}</strong>
          </div>
        </div>

        <div className="mcp-config-row">
          <div>
            <small>{copy.settings.mcpEndpoint}</small>
            <span>{endpoint || copy.settings.accessUnavailable}</span>
          </div>
          <button
            type="button"
            aria-label={copy.settings.mcpCopyEndpoint}
            disabled={!endpoint}
            onClick={() => void copyText(endpoint)}
          >
            <Copy size={16} strokeWidth={2.2} />
          </button>
        </div>

        <div className="mcp-config-row">
          <div>
            <small>{copy.settings.mcpCustomHeader}</small>
            <strong>{copy.settings.mcpHeaderName}</strong>
            <span>{headerValue}</span>
          </div>
          <button
            type="button"
            aria-label={copy.settings.mcpCopyHeader}
            disabled={!plainToken}
            onClick={() => void copyText(headerValue)}
          >
            <Copy size={16} strokeWidth={2.2} />
          </button>
        </div>

        <button
          type="button"
          className="connection-check-button"
          onClick={() => void issue()}
          disabled={busy}
        >
          {busy ? copy.settings.mcpGenerating : copy.settings.mcpGenerateToken}
        </button>

        {feedback ? (
          <small className="mcp-feedback" role="status" aria-live="polite">
            {feedback === 'ready'
              ? copy.settings.mcpTokenReady
              : feedback === 'copied'
                ? copy.settings.mcpCopied
                : feedback === 'revoked'
                  ? copy.settings.mcpRevoked
                  : copy.settings.mcpFailed}
          </small>
        ) : null}
        {plainToken ? (
          <small className="mcp-token-warning">
            {copy.settings.mcpTokenWarning}
          </small>
        ) : null}

        <div className="mcp-active-token">
          <small>{copy.settings.mcpTokenPrefix}</small>
          {status ? (
            <>
              <span>
                {copy.settings.accessExpires}{' '}
                {new Date(status.expiresAt).toLocaleString()}
              </span>
              {status.lastUsedAt ? (
                <span>
                  {copy.settings.accessLastUsed}{' '}
                  {new Date(status.lastUsedAt).toLocaleString()}
                </span>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const revoked = await onRevokeTokens();
                  if (revoked) {
                    setPlainToken('');
                    setStatus(null);
                    setFeedback('revoked');
                  } else {
                    setFeedback('failed');
                  }
                  setBusy(false);
                }}
              >
                {copy.settings.mcpRevoke}
              </button>
            </>
          ) : (
            <span>{copy.settings.mcpNoTokens}</span>
          )}
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
                          if (await onResolveProposal(proposal, decision)) {
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
    </section>
  );
}
