import { useEffect, useState } from 'react';
import { Bot, Check, ChevronRight, Link2 } from 'lucide-react';
import { useAppLanguage } from '../../i18n';
import type { MyLifeMemoryConnectionStatus } from '../../services/myLifeMemoryConnection';
import type { SettingsPanel } from './settingsTypes';

const STYLES = ['concise', 'direct', 'gentle', 'sharp'] as const;

type AiPanelMode = Extract<SettingsPanel, 'ai' | 'my-life-memory-mcp'>;

export function AiSettingsPanel({
  mode,
  styles,
  userPrompt,
  onStyles,
  onUserPrompt,
  onPanel,
  onConnectMyLifeMemory,
  onTestMyLifeMemory,
  onGetMyLifeMemoryStatus,
  onDisconnectMyLifeMemory,
}: {
  mode: AiPanelMode;
  styles: string[];
  userPrompt: string;
  onStyles: (styles: string[]) => void;
  onUserPrompt: (value: string) => void;
  onPanel: (panel: SettingsPanel) => void;
  onConnectMyLifeMemory: (token: string) => Promise<MyLifeMemoryConnectionStatus | null>;
  onTestMyLifeMemory: () => Promise<MyLifeMemoryConnectionStatus | null>;
  onGetMyLifeMemoryStatus: () => Promise<MyLifeMemoryConnectionStatus | null>;
  onDisconnectMyLifeMemory: () => Promise<MyLifeMemoryConnectionStatus | null>;
}) {
  const { copy } = useAppLanguage();
  const [myLifeMemoryToken, setMyLifeMemoryToken] = useState('');
  const [myLifeMemoryStatus, setMyLifeMemoryStatus] =
    useState<MyLifeMemoryConnectionStatus | null>(null);
  const [myLifeMemoryFeedback, setMyLifeMemoryFeedback] = useState<
    'connected' | 'tested' | 'disconnected' | 'unavailable' | null
  >(null);
  const [busy, setBusy] = useState(false);

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
        </div>
      </section>
    );
  }

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
            disabled={busy || !myLifeMemoryStatus || myLifeMemoryStatus.state === 'disconnected'}
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
