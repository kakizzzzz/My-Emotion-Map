import {
  Languages,
  MapPin,
} from 'lucide-react';
import { LANGUAGE_OPTIONS, useAppLanguage } from '../../i18n';
import type { LocationRequestState } from '../../useLocationController';
import type { SettingsPanel } from './settingsTypes';

export function GeneralSettingsPanel({
  panel,
  locationRequestState,
  onRequestLocation,
}: {
  panel: Extract<SettingsPanel, 'language' | 'location'>;
  locationRequestState: LocationRequestState;
  onRequestLocation: () => void;
}) {
  const { copy, language, setLanguage } = useAppLanguage();

  if (panel === 'language') {
    return (
      <section className="copied-settings-card language-card">
        <header>
          <Languages size={24} strokeWidth={2.2} />
          <h2>{copy.settings.language}</h2>
        </header>
        <div>
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={language === option.value ? 'is-selected' : ''}
              onClick={() => setLanguage(option.value)}
              aria-pressed={language === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
    );
  }

  if (panel === 'location') {
    const status =
      locationRequestState === 'ready'
        ? copy.location.permissionReady
        : locationRequestState === 'insecure'
          ? copy.location.permissionInsecure
          : locationRequestState === 'unsupported'
            ? copy.location.permissionUnsupported
            : locationRequestState === 'denied'
              ? copy.location.permissionDenied
              : locationRequestState === 'timeout'
                ? copy.location.permissionTimeout
                : locationRequestState === 'unavailable'
                  ? copy.location.permissionUnavailable
                  : '';
    return (
      <section className="copied-settings-card location-settings-card">
        <header>
          <MapPin size={24} strokeWidth={2.2} />
          <h2>{copy.location.settingsTitle}</h2>
        </header>
        <p>{copy.location.settingsBody}</p>
        <button
          className="location-request-button"
          onClick={onRequestLocation}
          disabled={locationRequestState === 'requesting'}
        >
          <MapPin size={18} strokeWidth={2.2} />
          <span>
            {locationRequestState === 'requesting'
              ? copy.location.permissionRequesting
              : locationRequestState === 'ready'
                ? copy.location.refreshLocation
                : copy.location.requestNow}
          </span>
        </button>
        <p
          className="location-permission-status"
          role="status"
          aria-live="polite"
        >
          {status}
        </p>
        <small>{copy.location.notNowHint}</small>
      </section>
    );
  }

  return null;
}
