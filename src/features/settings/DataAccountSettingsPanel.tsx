import {
  ChevronRight,
  Download,
  Clock3,
  KeyRound,
  Languages,
  MapPin,
} from 'lucide-react';
import { useAppLanguage } from '../../i18n';
import type { SettingsPanel } from './settingsTypes';

export function DataAccountSettingsPanel({
  onPanel,
}: {
  onPanel: (panel: SettingsPanel) => void;
}) {
  const { copy } = useAppLanguage();
  return (
    <section className="connections-card-list data-account-panel">
      <div className="settings-submenu">
        <button onClick={() => onPanel('language')}>
          <Languages size={24} strokeWidth={2.2} />
          <span>{copy.settings.language}</span>
          <ChevronRight size={24} strokeWidth={2.2} />
        </button>
        <button onClick={() => onPanel('location')}>
          <MapPin size={24} strokeWidth={2.2} />
          <span>{copy.location.settingsTitle}</span>
          <ChevronRight size={24} strokeWidth={2.2} />
        </button>
        <button onClick={() => onPanel('follow-up')}>
          <Clock3 size={24} strokeWidth={2.2} />
          <span>{copy.settings.followUpSchedule}</span>
          <ChevronRight size={24} strokeWidth={2.2} />
        </button>
        <button onClick={() => onPanel('export')}>
          <Download size={24} strokeWidth={2.2} />
          <span>{copy.settings.exportData}</span>
          <ChevronRight size={24} strokeWidth={2.2} />
        </button>
        <button onClick={() => onPanel('emotion-map-mcp')}>
          <KeyRound size={24} strokeWidth={2.2} />
          <span>{copy.settings.emotionMapMcp}</span>
          <ChevronRight size={24} strokeWidth={2.2} />
        </button>
      </div>
    </section>
  );
}
