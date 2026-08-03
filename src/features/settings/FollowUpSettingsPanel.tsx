import { Clock3, Plus, Trash2 } from 'lucide-react';
import { useAppLanguage } from '../../i18n';
import { normalizeFollowUpCurve } from '../../domain/followUps';

export function FollowUpSettingsPanel({
  intervals,
  onIntervals,
}: {
  intervals: number[];
  onIntervals: (intervals: number[]) => void;
}) {
  const { copy } = useAppLanguage();
  const curve = normalizeFollowUpCurve(intervals);

  const updateInterval = (index: number, days: number) => {
    if (!Number.isSafeInteger(days) || days < 1 || days > 365) return;
    onIntervals(normalizeFollowUpCurve(
      curve.map((item, itemIndex) => itemIndex === index ? days : item),
    ));
  };

  return (
    <section className="copied-settings-card follow-up-settings-card">
      <header>
        <Clock3 size={24} strokeWidth={2.2} />
        <h2>{copy.settings.followUpSchedule}</h2>
      </header>
      <p>{copy.settings.followUpScheduleBody}</p>
      <div className="follow-up-curve" aria-label={copy.settings.followUpSchedule}>
        {curve.map((days, index) => (
          <div className="follow-up-curve-point" key={`${index}-${days}`}>
            <i aria-hidden="true" />
            <label>
              <span>{copy.settings.followUpSequence(index + 1)}</span>
              <span className="follow-up-day-input">
                <input
                  type="number"
                  min="1"
                  max="365"
                  inputMode="numeric"
                  value={days}
                  aria-label={copy.settings.followUpDayLabel(index + 1)}
                  onChange={(event) => updateInterval(
                    index,
                    Number(event.target.value),
                  )}
                />
                <small>{copy.settings.daysLater}</small>
              </span>
            </label>
            <button
              type="button"
              disabled={curve.length === 1}
              onClick={() => onIntervals(curve.filter((_, itemIndex) => itemIndex !== index))}
              aria-label={copy.settings.removeFollowUpTime}
            >
              <Trash2 size={17} strokeWidth={2.2} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="follow-up-add-time"
        disabled={curve.length >= 8 || curve[curve.length - 1] >= 365}
        onClick={() => onIntervals(normalizeFollowUpCurve([
          ...curve,
          Math.min(365, curve[curve.length - 1] + 7),
        ]))}
      >
        <Plus size={18} strokeWidth={2.2} />
        {copy.settings.addFollowUpTime}
      </button>
    </section>
  );
}
