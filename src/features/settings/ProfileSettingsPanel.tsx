import { useRef, useState } from 'react';
import { Lock, UserRound } from 'lucide-react';
import { useAppLanguage } from '../../i18n';
import { createAvatarDataUrl } from '../../app/profilePreferences';
import type { ToastHandler } from '../../app/appTypes';

export function ProfileSettingsPanel({
  avatarSrc,
  profileName,
  canChangePassword,
  onAvatarSrc,
  onProfileName,
  onUpdatePassword,
  onToast,
}: {
  avatarSrc: string;
  profileName: string;
  canChangePassword: boolean;
  onAvatarSrc: (value: string) => void;
  onProfileName: (value: string) => void;
  onUpdatePassword: (
    password: string,
  ) => Promise<'success' | 'weak_password' | 'unavailable'>;
  onToast: ToastHandler;
}) {
  const { copy } = useAppLanguage();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [editingPassword, setEditingPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const closePasswordEditor = () => {
    setEditingPassword(false);
    setPassword('');
    setConfirmation('');
    setPasswordError('');
  };

  const savePassword = async () => {
    if (password.length < 8) {
      setPasswordError(copy.auth.passwordTooShort);
      return;
    }
    if (password !== confirmation) {
      setPasswordError(copy.auth.passwordMismatch);
      return;
    }
    setSavingPassword(true);
    setPasswordError('');
    try {
      const result = await onUpdatePassword(password);
      if (result === 'success') {
        closePasswordEditor();
        onToast(copy.settings.passwordUpdated);
      } else {
        setPasswordError(
          result === 'weak_password'
            ? copy.auth.passwordRejected
            : copy.auth.unavailable,
        );
      }
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <section className="copied-settings-card profile-editor-card">
      <button
        className="profile-editor-avatar"
        onClick={() => inputRef.current?.click()}
        aria-label={copy.settings.changeAvatar}
      >
        {avatarSrc ? (
          <img src={avatarSrc} alt={copy.settings.currentAvatar} />
        ) : (
          <UserRound size={42} strokeWidth={2.2} />
        )}
      </button>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          try {
            onAvatarSrc(await createAvatarDataUrl(file));
          } catch {
            onToast(copy.feedback.imageReadFailed);
          }
        }}
      />
      <div className="profile-editor-fields">
        <label>
          <UserRound size={24} strokeWidth={2.2} />
          <input
            value={profileName}
            onChange={(event) => onProfileName(event.target.value)}
            placeholder={copy.settings.localProfileName}
            aria-label={copy.settings.localProfileName}
          />
        </label>
        <div className="profile-password-row">
          <Lock size={24} strokeWidth={2.2} />
          <span aria-label={copy.auth.password}>••••••••</span>
          <button
            type="button"
            onClick={() => setEditingPassword(true)}
            disabled={!canChangePassword}
          >
            {copy.settings.changePassword}
          </button>
        </div>
        {editingPassword ? (
          <div className="profile-password-editor">
            <label>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={copy.settings.newPassword}
                aria-label={copy.settings.newPassword}
              />
            </label>
            <label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={copy.auth.confirmPassword}
                aria-label={copy.auth.confirmPassword}
              />
            </label>
            {passwordError ? <small role="alert">{passwordError}</small> : null}
            <div>
              <button type="button" onClick={closePasswordEditor}>
                {copy.common.cancel}
              </button>
              <button type="button" onClick={() => void savePassword()} disabled={savingPassword}>
                {copy.common.save}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
