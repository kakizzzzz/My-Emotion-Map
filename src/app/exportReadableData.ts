import { getEmotionLabel } from '../domain/notePrompts';
import type { AppLanguage } from '../i18n';
import type { AppDataSnapshot, EmotionNote } from '../types';

export type DataExportRange =
  | { mode: 'all' }
  | { mode: 'range'; startDate: string; endDate: string };

export type ReadableExportResult = {
  recordCount: number;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const matchesRange = (note: EmotionNote, range: DataExportRange) =>
  range.mode === 'all' ||
  (note.date >= range.startDate && note.date <= range.endDate);

const noteMarkup = (note: EmotionNote, language: AppLanguage) => {
  const answers = note.answers
    .filter((answer) => answer.answer.trim())
    .map(
      (answer) => `<div class="answer"><dt>${escapeHtml(answer.question)}</dt><dd>${escapeHtml(answer.answer)}</dd></div>`,
    )
    .join('');
  const detail = [note.date, note.time, note.place]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' · ');
  const emotion = note.emotion
    ? escapeHtml(getEmotionLabel(note.emotion, language))
    : '';

  return `<article><header><h2>${escapeHtml(note.title)}</h2><p>${detail}</p>${emotion ? `<span>${emotion}</span>` : ''}</header>${note.excerpt.trim() ? `<p class="excerpt">${escapeHtml(note.excerpt)}</p>` : ''}${answers ? `<dl>${answers}</dl>` : ''}</article>`;
};

export const exportReadableData = ({
  snapshot,
  range,
  language,
}: {
  snapshot: AppDataSnapshot;
  range: DataExportRange;
  language: AppLanguage;
}): ReadableExportResult => {
  const records = snapshot.notes
    .filter((note) => !note.isDraft && matchesRange(note, range))
    .sort((left, right) =>
      `${right.date} ${right.time}`.localeCompare(`${left.date} ${left.time}`),
    );
  if (!records.length) return { recordCount: 0 };

  const exportedAt = new Intl.DateTimeFormat(
    language === 'ko' ? 'ko-KR' : language === 'en' ? 'en-US' : 'zh-CN',
    { dateStyle: 'medium', timeStyle: 'short' },
  ).format(new Date());
  const body = records.map((note) => noteMarkup(note, language)).join('');
  const documentTitle = 'My Emotion Map — Offline record report';
  const html = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${documentTitle}</title><style>body{max-width:720px;margin:0 auto;padding:44px 24px;background:#f7f7f5;color:#1d1d1c;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.6}h1{margin:0;font-size:30px;letter-spacing:-.04em}main>p{margin:8px 0 28px;color:#666}article{margin:14px 0;padding:20px;border-radius:18px;background:#fff;box-shadow:0 6px 22px rgba(0,0,0,.05)}article header{display:grid;gap:4px}h2{margin:0;font-size:18px;letter-spacing:-.02em}article p{margin:0;color:#666;font-size:13px}article header span{width:max-content;margin-top:6px;padding:3px 9px;border-radius:999px;background:#ededeb;font-size:12px}.excerpt{margin-top:14px;color:#292927;font-size:14px}dl{margin:16px 0 0}dt{font-size:12px;font-weight:700}dd{margin:3px 0 12px;font-size:14px;white-space:pre-wrap}@media print{body{padding:0;background:#fff}article{break-inside:avoid;box-shadow:none;border:1px solid #e4e4e1}}</style></head><body><main><h1>My Emotion Map</h1><p>Offline record report · ${escapeHtml(exportedAt)} · ${records.length} records</p>${body}</main></body></html>`;
  const url = URL.createObjectURL(
    new Blob([html], { type: 'text/html;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `my-emotion-map-report-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);

  return { recordCount: records.length };
};
