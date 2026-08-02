import { useState, type FormEvent } from 'react';
import { AtSign, KeyRound, Lock } from 'lucide-react';
import { LANGUAGE_OPTIONS, useAppLanguage } from '../../i18n';
import {
  isValidAccountId,
  type AuthMode,
  type AuthResult,
} from '../../services/accountAuth';
import { LoginWaterBackground } from './LoginWaterBackground';

export function LoginScreen({
  ready,
  configured,
  onAuthenticate,
}: {
  ready: boolean;
  configured: boolean;
  onAuthenticate: (
    mode: AuthMode,
    account: string,
    password: string,
    passwordConfirmation: string,
  ) => Promise<AuthResult>;
}) {
  const { copy, language, setLanguage } = useAppLanguage();
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState('');

  const authenticate = async () => {
    const normalizedAccount = account.trim();
    if (!isValidAccountId(normalizedAccount)) {
      setAuthError(copy.auth.invalidAccount);
      return;
    }
    if (password.length < 8) {
      setAuthError(copy.auth.passwordTooShort);
      return;
    }
    if (authMode === 'register' && password !== confirmPassword) {
      setAuthError(copy.auth.passwordMismatch);
      return;
    }
    if (!configured || busy) {
      setAuthError(copy.auth.unavailable);
      return;
    }

    setAuthError('');
    setBusy(true);
    try {
      const result = await onAuthenticate(
        authMode,
        normalizedAccount,
        password,
        confirmPassword,
      );
      if (result === 'signed_in') {
        return;
      } else if (result === 'confirmation_required') {
        setAuthMode('login');
        setConfirmPassword('');
        setAuthError(copy.auth.confirmationRequired);
      } else if (result === 'account_exists') {
        setAuthMode('login');
        setConfirmPassword('');
        setAuthError(copy.auth.accountExists);
      } else if (result === 'rate_limited') {
        setAuthError(copy.auth.rateLimited);
      } else if (result === 'weak_password') {
        setAuthError(copy.auth.passwordRejected);
      } else if (result === 'invalid_credentials') {
        setAuthError(copy.auth.invalidCredentials);
      } else {
        setAuthError(copy.auth.unavailable);
      }
    } catch {
      setAuthError(copy.auth.unavailable);
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
      <LoginWaterBackground />
      <div className="login-top-controls">
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
                  onChange={(event) => {
                    setAccount(event.target.value.slice(0, 24));
                    setAuthError('');
                  }}
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
                  onChange={(event) => {
                    setPassword(event.target.value.slice(0, 200));
                    setAuthError('');
                  }}
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
                    onChange={(event) => {
                      setConfirmPassword(event.target.value.slice(0, 200));
                      setAuthError('');
                    }}
                    placeholder={copy.auth.confirmPassword}
                    aria-label={copy.auth.confirmPassword}
                  />
                </label>
              ) : null}
            </div>
            {authError ? (
              <div className="login-auth-error" role="status" aria-live="polite">
                {authError}
              </div>
            ) : null}
            <div className="login-actions">
              <button
                type={authMode === 'login' ? 'submit' : 'button'}
                className="login-primary-action"
                disabled={busy}
                onClick={() => {
                  if (authMode === 'login') return;
                  setAuthMode('login');
                  setConfirmPassword('');
                  setAuthError('');
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
                  setAuthError('');
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
