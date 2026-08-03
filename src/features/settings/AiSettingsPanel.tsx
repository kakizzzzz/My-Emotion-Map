import { useEffect, useState } from 'react';
import { ChevronRight, History, Link2, MessageCircle } from 'lucide-react';
import { useAppLanguage } from '../../i18n';
import {
  MAX_AI_CONTEXT_MESSAGE_COUNT,
  MIN_AI_CONTEXT_MESSAGE_COUNT,
  normalizeAiContextMessageCount,
} from '../../app/profilePreferences';
import type { MyLifeMemoryConnectionStatus } from '../../services/myLifeMemoryConnection';
import type { SettingsPanel } from './settingsTypes';

type AiPanelMode = Extract<SettingsPanel, 'ai' | 'my-life-memory-mcp'>;

export function AiSettingsPanel({
  mode,
  userPrompt,
  contextMessageCount,
  onUserPrompt,
  onContextMessageCount,
  onPanel,
  onConnectMyLifeMemory,
  onTestMyLifeMemory,
  onGetMyLifeMemoryStatus,
  onDisconnectMyLifeMemory,
}: {
  mode: AiPanelMode;
  userPrompt: string;
  contextMessageCount: number;
  onUserPrompt: (value: string) => void;
  onContextMessageCount: (count: number) => void;
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
        <article className="connection-card is-open ai-conversation-settings-card">
          <div className="connection-card__header">
            <span className="connection-card__icon">
              <MessageCircle size={22} strokeWidth={2.2} />
            </span>
            <span className="connection-card__title">
              <strong>{copy.settings.aiConversation}</strong>
            </span>
          </div>
          <label className="ai-context-control">
            <span>
              <History size={18} strokeWidth={2.2} />
              <strong>{copy.settings.contextMessages}</strong>
              <output>{copy.settings.contextMessageCount(contextMessageCount)}</output>
            </span>
            <input
              type="range"
              min={MIN_AI_CONTEXT_MESSAGE_COUNT}
              max={MAX_AI_CONTEXT_MESSAGE_COUNT}
              step="2"
              value={contextMessageCount}
              aria-label={copy.settings.contextMessages}
              onChange={(event) => onContextMessageCount(
                normalizeAiContextMessageCount(event.target.value),
              )}
            />
            <small>{copy.settings.contextMessagesBody}</small>
          </label>
          <div className="ai-user-prompt-card">
            <label htmlFor="ai-user-prompt">{copy.settings.userPrompt}</label>
            <textarea
              id="ai-user-prompt"
              value={userPrompt}
              maxLength={500}
              placeholder={copy.settings.userPromptPlaceholder}
              onChange={(event) => onUserPrompt(event.target.value)}
            />
          </div>
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
