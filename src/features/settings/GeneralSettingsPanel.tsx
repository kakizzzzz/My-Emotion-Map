import { useRef } from 'react';
import {
  Download,
  Languages,
  MapPin,
  Play,
  Trash2,
  Upload,
} from 'lucide-react';
import { LANGUAGE_OPTIONS, useAppLanguage } from '../../i18n';
import type { DataMode } from '../../types';
import type { LocationRequestState } from '../../useLocationController';
import type { SettingsPanel } from './settingsTypes';

export function GeneralSettingsPanel({
  panel,
  dataMode,
  locationRequestState,
  onPanel,
  onRequestLocation,
  onImportData,
  onDeleteAllData,
  onLoadDemo,
  onExitDemo,
}: {
  panel: Extract<
    SettingsPanel,
    'settings' | 'language' | 'location' | 'data'
  >;
  dataMode: DataMode;
  locationRequestState: LocationRequestState;
  onPanel: (panel: SettingsPanel) => void;
  onRequestLocation: () => void;
  onImportData: (file: File) => Promise<void>;
  onDeleteAllData: () => void;
  onLoadDemo: () => boolean;
  onExitDemo: () => boolean;
}) {
  const { copy, language, setLanguage } = useAppLanguage();
  const importInputRef = useRef<HTMLInputElement | null>(null);

  if (panel === 'settings') {
    return (
      <div className="settings-submenu">
        <button onClick={() => onPanel('language')}>
          <Languages size={24} strokeWidth={2.2} />
          <span>{copy.settings.language}</span>
        </button>
        <button onClick={() => onPanel('location')}>
          <MapPin size={24} strokeWidth={2.2} />
          <span>{copy.location.settingsTitle}</span>
        </button>
        <button onClick={() => onPanel('export')}>
          <Download size={24} strokeWidth={2.2} />
          <span>{copy.settings.exportData}</span>
        </button>
        <button onClick={() => onPanel('data')}>
          <Download size={24} strokeWidth={2.2} />
          <span>{copy.settings.dataManagement}</span>
        </button>
      </div>
    );
  }

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

  return (
    <section className="copied-settings-card data-management-card">
      <header>
        <Download size={24} strokeWidth={2.2} />
        <h2>{copy.settings.dataManagement}</h2>
      </header>
      <div className="data-management-actions">
        <button onClick={() => importInputRef.current?.click()}>
          <Upload size={19} strokeWidth={2.2} />
          {copy.settings.importJson}
        </button>
        <input
          ref={importInputRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) await onImportData(file);
          }}
        />
        <button
          onClick={dataMode === 'demo' ? onExitDemo : onLoadDemo}
        >
          <Play size={19} strokeWidth={2.2} />
          {dataMode === 'demo'
            ? copy.settings.exitDemo
            : copy.settings.loadDemo}
        </button>
        <button
          className="is-destructive"
          onClick={onDeleteAllData}
        >
          <Trash2 size={19} strokeWidth={2.2} />
          {copy.settings.deleteAllData}
        </button>
      </div>
    </section>
  );
}
