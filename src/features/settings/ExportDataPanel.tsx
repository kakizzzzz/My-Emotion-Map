import { useRef, useState } from 'react';
import { Download, FileJson, Trash2, Upload } from 'lucide-react';
import { useAppLanguage, type AppLanguage } from '../../i18n';
import type { DataExportRange, ReadableExportResult } from '../../app/exportReadableData';
import {
  parseCompleteEmotionBackup,
  type ParsedEmotionBackup,
} from '../../domain/storage/emotionBackup';
import type { EmotionImportMode } from '../../domain/storage/emotionImport';

const DATA_COPY: Record<AppLanguage, {
  backupTitle: string;
  backupBody: string;
  backupAction: string;
  importAction: string;
  importInvalid: string;
  importFuture: string;
  previewTitle: string;
  previewLabels: [string, string, string, string, string];
  merge: string;
  replace: string;
  cancel: string;
  conflict: (count: number) => string;
  deleteTitle: string;
  deleteBody: string;
  deletePhrase: string;
  deletePlaceholder: (phrase: string) => string;
  deleteAction: string;
}> = {
  zh: {
    backupTitle: '完整数据备份',
    backupBody: '无损 JSON 备份包含记录、对话、回访、主题、头像和账号偏好，不包含密码、令牌或设备位置。',
    backupAction: '下载完整备份',
    importAction: '导入完整备份',
    importInvalid: '备份格式、引用或校验值无效，未导入任何数据。',
    importFuture: '这是更高版本的备份，请先升级应用。',
    previewTitle: '导入预览',
    previewLabels: ['记录', '对话', '消息', '回访', '重访'],
    merge: '合并',
    replace: '替换当前工作区',
    cancel: '取消',
    conflict: (count) => `${count} 个同 ID 实体存在差异，已保留本机版本并写入恢复记录。`,
    deleteTitle: '删除全部工作区数据',
    deleteBody: '这会在本机立即清空，并把永久删除操作同步到云端；不会删除登录账号。',
    deletePhrase: '永久删除',
    deletePlaceholder: (phrase) => `输入“${phrase}”确认`,
    deleteAction: '永久删除工作区数据',
  },
  en: {
    backupTitle: 'Complete data backup',
    backupBody: 'The lossless JSON backup includes records, conversations, follow-ups, revisits, theme, avatar, and account preferences. It excludes passwords, tokens, and device location.',
    backupAction: 'Download complete backup',
    importAction: 'Import complete backup',
    importInvalid: 'The backup format, references, or checksum is invalid. Nothing was imported.',
    importFuture: 'This backup was created by a newer app version. Upgrade first.',
    previewTitle: 'Import preview',
    previewLabels: ['Records', 'Conversations', 'Messages', 'Follow-ups', 'Revisits'],
    merge: 'Merge',
    replace: 'Replace workspace',
    cancel: 'Cancel',
    conflict: (count) => `${count} same-ID conflicts kept the local entity and were saved for recovery.`,
    deleteTitle: 'Delete all workspace data',
    deleteBody: 'This immediately empties this device and syncs permanent deletion to the cloud. It does not delete the login account.',
    deletePhrase: 'DELETE',
    deletePlaceholder: (phrase) => `Type “${phrase}” to confirm`,
    deleteAction: 'Permanently delete workspace',
  },
  ko: {
    backupTitle: '전체 데이터 백업',
    backupBody: '무손실 JSON 백업에는 기록, 대화, 후속 방문, 테마, 아바타와 계정 설정이 포함되며 비밀번호, 토큰과 기기 위치는 제외됩니다.',
    backupAction: '전체 백업 다운로드',
    importAction: '전체 백업 가져오기',
    importInvalid: '백업 형식, 참조 또는 체크섬이 올바르지 않아 아무 데이터도 가져오지 않았습니다.',
    importFuture: '더 새로운 앱 버전에서 만든 백업입니다. 먼저 앱을 업데이트하세요.',
    previewTitle: '가져오기 미리보기',
    previewLabels: ['기록', '대화', '메시지', '후속 방문', '재방문'],
    merge: '병합',
    replace: '현재 작업 공간 교체',
    cancel: '취소',
    conflict: (count) => `같은 ID 충돌 ${count}개는 로컬 항목을 유지하고 복구 기록에 저장했습니다.`,
    deleteTitle: '모든 작업 공간 데이터 삭제',
    deleteBody: '이 기기에서 즉시 비우고 영구 삭제를 클라우드에 동기화합니다. 로그인 계정은 삭제하지 않습니다.',
    deletePhrase: '영구 삭제',
    deletePlaceholder: (phrase) => `확인하려면 “${phrase}” 입력`,
    deleteAction: '작업 공간 데이터 영구 삭제',
  },
};

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
  onExportCompleteBackup,
  onImportCompleteBackup,
  onDeleteAllData,
  workspaceAvailable,
}: {
  onExportData: (range: DataExportRange) => ReadableExportResult;
  onExportCompleteBackup: () => Promise<boolean>;
  onImportCompleteBackup: (
    parsed: ParsedEmotionBackup,
    mode: EmotionImportMode,
  ) => Promise<{ ok: boolean; conflicts: number }>;
  onDeleteAllData: () => Promise<boolean>;
  workspaceAvailable: boolean;
}) {
  const { copy, language } = useAppLanguage();
  const labels = DATA_COPY[language];
  const defaults = useState(defaultDates)[0];
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<DataExportRange['mode']>('all');
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [result, setResult] = useState<ReadableExportResult | null>(null);
  const [importPreview, setImportPreview] = useState<ParsedEmotionBackup | null>(null);
  const [importError, setImportError] = useState('');
  const [conflictNotice, setConflictNotice] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
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

  const readImport = async (file: File | undefined) => {
    setImportPreview(null);
    setConflictNotice('');
    if (!file) return;
    const parsed = await parseCompleteEmotionBackup(await file.text());
    if (!parsed.ok) {
      setImportError(parsed.issue === 'future-version'
        ? labels.importFuture
        : labels.importInvalid);
      return;
    }
    setImportError('');
    setImportPreview(parsed.value);
  };

  const applyImport = async (importMode: EmotionImportMode) => {
    if (!importPreview || busy) return;
    setBusy(true);
    const applied = await onImportCompleteBackup(importPreview, importMode);
    setBusy(false);
    if (!applied.ok) return;
    setImportPreview(null);
    if (inputRef.current) inputRef.current.value = '';
    setConflictNotice(applied.conflicts ? labels.conflict(applied.conflicts) : '');
  };

  const previewValues = importPreview ? [
    importPreview.preview.records,
    importPreview.preview.conversations,
    importPreview.preview.messages,
    importPreview.preview.followUps,
    importPreview.preview.revisits,
  ] : [];

  return (
    <div className="export-data-panel">
      <section className="copied-settings-card export-data-card">
        <header>
          <Download size={22} strokeWidth={2.2} />
          <h2>{copy.settings.exportData}</h2>
        </header>
        <div className="export-mode-switch" role="group" aria-label={copy.settings.exportData}>
          <button type="button" className={mode === 'all' ? 'is-selected' : ''}
            onClick={() => setMode('all')} aria-pressed={mode === 'all'}>
            {copy.settings.exportAll}
          </button>
          <button type="button" className={mode === 'range' ? 'is-selected' : ''}
            onClick={() => setMode('range')} aria-pressed={mode === 'range'}>
            {copy.settings.exportRange}
          </button>
        </div>
        {mode === 'range' ? (
          <div className="export-date-fields">
            <label><span>{copy.settings.exportStartDate}</span><input type="date"
              value={startDate} max={endDate || undefined}
              onChange={(event) => setStartDate(event.target.value)} /></label>
            <label><span>{copy.settings.exportEndDate}</span><input type="date"
              value={endDate} min={startDate || undefined}
              onChange={(event) => setEndDate(event.target.value)} /></label>
          </div>
        ) : null}
        {rangeInvalid ? <small className="export-validation">
          {copy.settings.exportRangeInvalid}
        </small> : null}
        <button type="button" className="export-submit" onClick={exportRecords}
          disabled={rangeInvalid}>{copy.settings.exportReport}</button>
        {result ? <p className="export-result" role="status">
          {result.recordCount ? copy.settings.exportReady(result.recordCount) : copy.settings.exportEmpty}
        </p> : null}
      </section>

      <section className="copied-settings-card export-data-card data-backup-card">
        <header><FileJson size={22} strokeWidth={2.2} /><h2>{labels.backupTitle}</h2></header>
        <p className="data-management-copy">{labels.backupBody}</p>
        <button type="button" className="export-submit" disabled={!workspaceAvailable || busy}
          onClick={() => void onExportCompleteBackup()}>
          <Download size={17} />{labels.backupAction}
        </button>
        <input ref={inputRef} className="visually-hidden" type="file"
          accept="application/json,.json" onChange={(event) =>
            void readImport(event.currentTarget.files?.[0])} />
        <button type="button" className="export-submit" disabled={!workspaceAvailable || busy}
          onClick={() => inputRef.current?.click()}>
          <Upload size={17} />{labels.importAction}
        </button>
        {importError ? <p className="export-validation" role="alert">{importError}</p> : null}
        {conflictNotice ? <p className="export-result" role="status">{conflictNotice}</p> : null}
        {importPreview ? (
          <div className="import-preview" role="group" aria-label={labels.previewTitle}>
            <strong>{labels.previewTitle}</strong>
            <dl>{labels.previewLabels.map((label, index) => (
              <div key={label}><dt>{label}</dt><dd>{previewValues[index]}</dd></div>
            ))}</dl>
            <div className="import-actions">
              <button type="button" disabled={busy} onClick={() => void applyImport('merge')}>
                {labels.merge}
              </button>
              <button type="button" disabled={busy} onClick={() => void applyImport('replace')}>
                {labels.replace}
              </button>
              <button type="button" disabled={busy} onClick={() => setImportPreview(null)}>
                {labels.cancel}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="copied-settings-card export-data-card data-delete-card">
        <header><Trash2 size={22} strokeWidth={2.2} /><h2>{labels.deleteTitle}</h2></header>
        <p className="data-management-copy">{labels.deleteBody}</p>
        <input value={deleteConfirmation}
          placeholder={labels.deletePlaceholder(labels.deletePhrase)}
          aria-label={labels.deletePlaceholder(labels.deletePhrase)}
          onChange={(event) => setDeleteConfirmation(event.target.value)} />
        <button type="button" className="export-submit data-delete-action"
          disabled={!workspaceAvailable || busy || deleteConfirmation !== labels.deletePhrase}
          onClick={() => void (async () => {
            setBusy(true);
            const deleted = await onDeleteAllData();
            setBusy(false);
            if (deleted) setDeleteConfirmation('');
          })()}>
          <Trash2 size={17} />{labels.deleteAction}
        </button>
      </section>
    </div>
  );
}
