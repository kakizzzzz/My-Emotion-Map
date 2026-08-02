import { useState } from 'react';
import { Download } from 'lucide-react';
import { useAppLanguage } from '../../i18n';
import type { DataExportRange, ReadableExportResult } from '../../app/exportReadableData';

export function ExportDataPanel({
  onExportData,
}: {
  onExportData: (range: DataExportRange) => ReadableExportResult;
}) {
  const { copy } = useAppLanguage();
  const [mode, setMode] = useState<DataExportRange['mode']>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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
    <section className="copied-settings-card export-data-card">
      <header>
        <Download size={24} strokeWidth={2.2} />
        <h2>{copy.settings.exportData}</h2>
      </header>
      <div className="export-mode-switch" role="group" aria-label={copy.settings.exportData}>
        <button
          className={mode === 'all' ? 'is-selected' : ''}
          onClick={() => setMode('all')}
          aria-pressed={mode === 'all'}
        >
          {copy.settings.exportAll}
        </button>
        <button
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
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            <span>{copy.settings.exportEndDate}</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>
      ) : null}
      {rangeInvalid ? <small className="export-validation">{copy.settings.exportRangeInvalid}</small> : null}
      <button className="export-submit" onClick={exportRecords} disabled={rangeInvalid}>
        <Download size={18} strokeWidth={2.2} />
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
  );
}
