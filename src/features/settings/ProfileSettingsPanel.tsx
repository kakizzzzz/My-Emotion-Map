import { useRef } from 'react';
import { Fingerprint, UserRound } from 'lucide-react';
import { useAppLanguage } from '../../i18n';
import { createAvatarDataUrl } from '../../app/profilePreferences';
import type { ToastHandler } from '../../app/appTypes';

export function ProfileSettingsPanel({
  avatarSrc,
  profileId,
  profileName,
  onAvatarSrc,
  onProfileName,
  onToast,
}: {
  avatarSrc: string;
  profileId: string;
  profileName: string;
  onAvatarSrc: (value: string) => void;
  onProfileName: (value: string) => void;
  onToast: ToastHandler;
}) {
  const { copy } = useAppLanguage();
  const inputRef = useRef<HTMLInputElement | null>(null);

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
        <label className="profile-id-field">
          <Fingerprint size={24} strokeWidth={2.2} />
          <input
            value={profileId}
            aria-label={copy.settings.profileId}
            readOnly
          />
        </label>
      </div>
      <p className="settings-honesty-note">
        {copy.settings.supabaseProfileHint}
      </p>
    </section>
  );
}
