import { useState } from 'react';
import { Download } from 'lucide-react';
import { useAppLanguage } from '../../i18n';
import type { DataExportRange, ReadableExportResult } from '../../app/exportReadableData';

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const defaultDates = () => {
  const today = new Date();
  return {
    start: dateKey(new Date(today.getFullYear(), today.getMonth(), 1)),
    end: dateKey(today),
  };
};

export function ExportDataPanel({
  onExportData,
}: {
  onExportData: (range: DataExportRange) => ReadableExportResult;
}) {
  const { copy } = useAppLanguage();
  const defaults = useState(defaultDates)[0];
  const [mode, setMode] = useState<DataExportRange['mode']>('all');
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [result, setResult] = useState<ReadableExportResult | null>(null);
  const rangeInvalid =
    mode === 'range' && (!startDate || !endDate || startDate > endDate);

  const exportRecords = () => {
    if (rangeInvalid) return;
    setResult(
      onExportData(
        mode === 'all' ? { mode } : { mode, startDate, endDate },
      ),
    );
  };

  return (
    <div className="export-data-panel">
      <section className="copied-settings-card export-data-card">
        <header>
          <Download size={22} strokeWidth={2.2} />
          <h2>{copy.settings.exportData}</h2>
        </header>
        <div
          className="export-mode-switch"
          role="group"
          aria-label={copy.settings.exportData}
        >
          <button
            type="button"
            className={mode === 'all' ? 'is-selected' : ''}
            onClick={() => setMode('all')}
            aria-pressed={mode === 'all'}
          >
            {copy.settings.exportAll}
          </button>
          <button
            type="button"
            className={mode === 'range' ? 'is-selected' : ''}
            onClick={() => setMode('range')}
            aria-pressed={mode === 'range'}
          >
            {copy.settings.exportRange}
          </button>
        </div>
        {mode === 'range' ? (
          <div className="export-date-fields">
            <label>
              <span>{copy.settings.exportStartDate}</span>
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              <span>{copy.settings.exportEndDate}</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>
        ) : null}
        {rangeInvalid ? (
          <small className="export-validation">
            {copy.settings.exportRangeInvalid}
          </small>
        ) : null}
        <button
          type="button"
          className="export-submit"
          onClick={exportRecords}
          disabled={rangeInvalid}
        >
          {copy.settings.exportReport}
        </button>
        {result ? (
          <p className="export-result" role="status">
            {result.recordCount
              ? copy.settings.exportReady(result.recordCount)
              : copy.settings.exportEmpty}
          </p>
        ) : null}
      </section>
    </div>
  );
}
