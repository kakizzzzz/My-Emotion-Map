import { useState, type FormEvent } from 'react';
import { AtSign, KeyRound, Lock } from 'lucide-react';
import { LANGUAGE_OPTIONS, useAppLanguage } from '../../i18n';
import type { ToastHandler } from '../../app/appTypes';
import {
  isValidAccountId,
  type AuthMode,
  type AuthResult,
} from '../../services/accountAuth';

const isInsideRotatedEllipse = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotation = 0,
) => {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = x - cx;
  const dy = y - cy;
  const rotatedX = dx * cos + dy * sin;
  const rotatedY = -dx * sin + dy * cos;
  return (
    (rotatedX * rotatedX) / (rx * rx) +
      (rotatedY * rotatedY) / (ry * ry) <=
    1
  );
};

const LOGIN_MAP_WIDTH = 430;
const LOGIN_MAP_HEIGHT = 932;
const LOGIN_MAP_DOT_SPACING = 7;

const isLoginMapLand = (x: number, y: number) =>
  isInsideRotatedEllipse(x, y, 0.1, 0.25, 0.18, 0.08, -0.25) ||
  isInsideRotatedEllipse(x, y, 0.2, 0.34, 0.15, 0.12, 0.08) ||
  isInsideRotatedEllipse(x, y, 0.3, 0.44, 0.08, 0.04, 0.25) ||
  isInsideRotatedEllipse(x, y, 0.31, 0.57, 0.1, 0.14, 0.12) ||
  isInsideRotatedEllipse(x, y, 0.48, 0.26, 0.1, 0.06, -0.1) ||
  isInsideRotatedEllipse(x, y, 0.54, 0.36, 0.09, 0.06, -0.08) ||
  isInsideRotatedEllipse(x, y, 0.55, 0.5, 0.1, 0.14, -0.1) ||
  isInsideRotatedEllipse(x, y, 0.72, 0.31, 0.2, 0.1, 0.03) ||
  isInsideRotatedEllipse(x, y, 0.82, 0.41, 0.15, 0.11, 0.12) ||
  isInsideRotatedEllipse(x, y, 0.68, 0.5, 0.06, 0.08, -0.15) ||
  isInsideRotatedEllipse(x, y, 0.79, 0.57, 0.09, 0.05, 0.35) ||
  isInsideRotatedEllipse(x, y, 0.83, 0.68, 0.1, 0.05, 0.08) ||
  isInsideRotatedEllipse(x, y, 0.47, 0.82, 0.45, 0.04);

const LOGIN_MAP_DOTS = Array.from({
  length: Math.ceil(LOGIN_MAP_HEIGHT / LOGIN_MAP_DOT_SPACING) + 1,
}).flatMap((_, row) =>
  Array.from({
    length: Math.ceil(LOGIN_MAP_WIDTH / LOGIN_MAP_DOT_SPACING) + 1,
  }).flatMap((__, col) => {
    const x =
      col * LOGIN_MAP_DOT_SPACING +
      (row % 2 ? LOGIN_MAP_DOT_SPACING / 2 : 0);
    const y = row * LOGIN_MAP_DOT_SPACING;
    if (!isLoginMapLand(x / LOGIN_MAP_WIDTH, y / LOGIN_MAP_HEIGHT)) return [];
    return [{ x, y, opacity: 0.08 + ((col * 3 + row) % 6) * 0.018 }];
  }),
);

function LoginWorldMapBackground() {
  return (
    <div className="login-map-background" aria-hidden="true">
      <svg
        viewBox={`0 0 ${LOGIN_MAP_WIDTH} ${LOGIN_MAP_HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="emotion-login-map-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.18" />
            <stop offset="14%" stopColor="white" stopOpacity="0.5" />
            <stop offset="78%" stopColor="white" stopOpacity="0.72" />
            <stop offset="100%" stopColor="white" stopOpacity="0.3" />
          </linearGradient>
          <mask id="emotion-login-map-mask">
            <rect
              width={LOGIN_MAP_WIDTH}
              height={LOGIN_MAP_HEIGHT}
              fill="url(#emotion-login-map-fade)"
            />
          </mask>
        </defs>
        <g mask="url(#emotion-login-map-mask)">
          {LOGIN_MAP_DOTS.map((dot) => (
            <circle
              key={`${dot.x}-${dot.y}`}
              cx={dot.x}
              cy={dot.y}
              r="1.25"
              fill="currentColor"
              opacity={dot.opacity}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

export function LoginScreen({
  ready,
  configured,
  onAuthenticate,
  onToast,
}: {
  ready: boolean;
  configured: boolean;
  onAuthenticate: (
    mode: AuthMode,
    account: string,
    password: string,
    passwordConfirmation: string,
  ) => Promise<AuthResult>;
  onToast: ToastHandler;
}) {
  const { copy, language, setLanguage } = useAppLanguage();
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const authenticate = async () => {
    const normalizedAccount = account.trim();
    if (!isValidAccountId(normalizedAccount)) {
      onToast(copy.auth.invalidAccount, { durationMs: 2400 });
      return;
    }
    if (password.length < 8) {
      onToast(copy.auth.passwordTooShort, { durationMs: 2400 });
      return;
    }
    if (authMode === 'register' && password !== confirmPassword) {
      onToast(copy.auth.passwordMismatch, { durationMs: 2400 });
      return;
    }
    if (!configured || busy) {
      onToast(copy.auth.unavailable, { durationMs: 2600 });
      return;
    }

    setBusy(true);
    try {
      const result = await onAuthenticate(
        authMode,
        normalizedAccount,
        password,
        confirmPassword,
      );
      if (result === 'signed_in') {
        onToast(copy.auth.signedIn, { durationMs: 1800 });
      } else if (result === 'confirmation_required') {
        onToast(copy.auth.confirmationRequired, { durationMs: 4200 });
      } else {
        onToast(copy.auth.unavailable, { durationMs: 2800 });
      }
    } catch {
      onToast(copy.auth.unavailable, { durationMs: 2800 });
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void authenticate();
  };

  return (
    <section className="login-screen" aria-label={copy.auth.loginTitle}>
      <LoginWorldMapBackground />
      <div className="login-language-switch" aria-label={copy.settings.language}>
        {LANGUAGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={language === option.value ? 'is-selected' : ''}
            onClick={() => setLanguage(option.value)}
            aria-pressed={language === option.value}
          >
            {option.value === 'zh' ? '中' : option.value === 'ko' ? '한' : 'EN'}
          </button>
        ))}
      </div>

      {!ready ? (
        <div className="login-centered-content">
          <h1>{copy.auth.title}</h1>
          <div className="login-restoring" role="status" aria-live="polite">
            {copy.auth.restoring}
          </div>
        </div>
      ) : (
        <form className="login-centered-content" onSubmit={submit}>
          <h1>{copy.auth.title}</h1>
          <div className="login-card">
            <header>
              <Lock size={24} strokeWidth={2.2} aria-hidden="true" />
              <h2>
                {authMode === 'register'
                  ? copy.auth.registerTitle
                  : copy.auth.loginTitle}
              </h2>
            </header>
            <p>
              {authMode === 'register'
                ? copy.auth.registerHint
                : copy.auth.loginHint}
            </p>
            <div className="login-fields">
              <label>
                <AtSign size={24} strokeWidth={2.2} aria-hidden="true" />
                <input
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="username"
                  value={account}
                  onChange={(event) => setAccount(event.target.value.slice(0, 24))}
                  placeholder={copy.auth.account}
                  aria-label={copy.auth.account}
                />
              </label>
              <label>
                <Lock size={24} strokeWidth={2.2} aria-hidden="true" />
                <input
                  type="password"
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value.slice(0, 200))}
                  placeholder={copy.auth.password}
                  aria-label={copy.auth.password}
                />
              </label>
              {authMode === 'register' ? (
                <label>
                  <KeyRound size={24} strokeWidth={2.2} aria-hidden="true" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value.slice(0, 200))
                    }
                    placeholder={copy.auth.confirmPassword}
                    aria-label={copy.auth.confirmPassword}
                  />
                </label>
              ) : null}
            </div>
            <div className="login-actions">
              <button
                type={authMode === 'login' ? 'submit' : 'button'}
                className="login-primary-action"
                disabled={busy}
                onClick={() => {
                  if (authMode === 'login') return;
                  setAuthMode('login');
                  setConfirmPassword('');
                }}
              >
                {busy && authMode === 'login'
                  ? copy.auth.loggingIn
                  : copy.auth.login}
              </button>
              <button
                type={authMode === 'register' ? 'submit' : 'button'}
                className="login-register-action"
                disabled={busy}
                onClick={() => {
                  if (authMode === 'register') return;
                  setAuthMode('register');
                }}
              >
                {busy && authMode === 'register'
                  ? copy.auth.registering
                  : copy.auth.register}
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
