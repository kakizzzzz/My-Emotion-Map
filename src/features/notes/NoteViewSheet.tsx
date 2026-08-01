import { useState } from "react";
import { Edit2, X } from "lucide-react";
import { motion } from "motion/react";
import { EmotionStar } from "../../EmotionStar";
import { MOTION } from "../../motion";
import { useAppLanguage } from "../../i18n";
import type {
  EmotionMoment,
  EmotionNote,
  FollowUpRecord,
  RevisitRecord,
} from "../../types";
import { getEmotionLabel, getPlaceRatings } from '../../domain/notePrompts';
import {
  formatFollowUpTimestamp,
} from '../../domain/followUps';
import { useDialogFocus } from '../../app/useDialogFocus';

export function NoteViewSheet({
  moment,
  note,
  followUps,
  revisits,
  onClose,
  onEdit,
}: {
  moment: EmotionMoment;
  note: EmotionNote;
  followUps: FollowUpRecord[];
  revisits: RevisitRecord[];
  onClose: () => void;
  onEdit: () => void;
}) {
  const { copy, language, locale } = useAppLanguage();
  const [activePane, setActivePane] = useState<'note' | 'follow-ups'>('note');
  const dialogRef = useDialogFocus<HTMLElement>({ onEscape: onClose });
  const answeredPrompts = note.answers.filter((answer) => answer.answer.trim());
  const rating = getPlaceRatings(language).find(
    (item) => item.key === note.placeRating,
  );
  const followUpHistory = [...followUps].sort(
    (left, right) =>
      new Date(right.answeredAt ?? right.dueAt).getTime() -
      new Date(left.answeredAt ?? left.dueAt).getTime(),
  );
  const revisitHistory = [...revisits].sort(
    (left, right) =>
      new Date(right.revisitedAt).getTime() -
      new Date(left.revisitedAt).getTime(),
  );

  return (
    <motion.div
      className="overlay-layer note-editor-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        ref={dialogRef}
        className="note-view-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={copy.note.recordLabel}
        tabIndex={-1}
        initial={{ y: 32, opacity: 0.94 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 26, opacity: 0 }}
        transition={MOTION.sheet}
      >
        <header className="sheet-header">
          <small>
            {moment.date} · {moment.time}
            {typeof moment.heartRate === 'number'
              ? ` · ${copy.health.heartRate} ${moment.heartRate} bpm`
              : ''}
          </small>
          <button
            className="popup-close-button"
            onClick={onClose}
            aria-label={copy.common.close}
          >
            <X size={19} strokeWidth={2.2} />
          </button>
        </header>

        <nav className="note-view-tabs" aria-label={copy.note.recordLabel}>
          <button
            className={activePane === 'note' ? 'is-active' : ''}
            onClick={() => setActivePane('note')}
            aria-pressed={activePane === 'note'}
          >
            {copy.note.informationTab}
          </button>
          <button
            className={activePane === 'follow-ups' ? 'is-active' : ''}
            onClick={() => setActivePane('follow-ups')}
            aria-pressed={activePane === 'follow-ups'}
          >
            {copy.note.followUpTab}
          </button>
        </nav>

        <div className="note-view-scroll">
          {activePane === 'note' ? (
            <>
              <section className="note-view-hero">
                <EmotionStar
                  emotion={note.emotion}
                  size={54}
                  colorOverride={note.color ?? moment.color}
                />
                <div>
                  <h3>{note.title}</h3>
                  <span>{getEmotionLabel(note.emotion, language)}</span>
                </div>
              </section>

              <section
                className="note-view-summary"
                aria-label={copy.note.summary}
              >
                <span>{copy.note.placeFeeling}</span>
                <strong>{rating?.label ?? copy.note.notFilled}</strong>
              </section>

              {answeredPrompts.length ? (
                <section className="note-view-prompts">
                  {answeredPrompts.map((answer) => (
                    <article key={answer.id}>
                      <h3>{answer.question}</h3>
                      <p>{answer.answer}</p>
                    </article>
                  ))}
                </section>
              ) : (
                <p className="note-view-excerpt">{note.excerpt}</p>
              )}
            </>
          ) : followUpHistory.length || revisitHistory.length ? (
            <section
              className="note-follow-up-list"
              aria-label={copy.note.followUpTab}
            >
              {revisitHistory.map((record) => (
                <article
                  className="note-follow-up-record"
                  key={record.id}
                >
                  <header>
                    <h3>{copy.note.revisitHistory}</h3>
                    <time dateTime={record.revisitedAt}>
                      {formatFollowUpTimestamp(
                        record.revisitedAt,
                        locale,
                      )}
                    </time>
                  </header>
                  <p>
                    {getEmotionLabel(record.originalEmotion, language)} →{' '}
                    {getEmotionLabel(record.revisitedEmotion, language)}
                  </p>
                  <small>{copy.note.originalPreserved}</small>
                </article>
              ))}
              {followUpHistory.map((record) => (
                <article className="note-follow-up-record" key={record.id}>
                  <header>
                    <h3>{copy.note.followUpAfterDays(record.intervalDays)}</h3>
                    <time dateTime={record.answeredAt ?? record.dueAt}>
                      {formatFollowUpTimestamp(
                        record.answeredAt ?? record.dueAt,
                        locale,
                      )}
                    </time>
                  </header>
                  <p>{record.prompt}</p>
                  <strong>
                    {record.status === 'skipped'
                      ? copy.note.skipped
                      : record.response ?? copy.note.answered}
                  </strong>
                  {record.answeredVia ? (
                    <small>
                      {record.answeredVia === 'inbox'
                        ? copy.note.answeredInInbox
                        : copy.note.answeredInChat}
                    </small>
                  ) : null}
                </article>
              ))}
            </section>
          ) : (
            <div className="note-follow-up-empty">
              {copy.note.noFollowUps}
            </div>
          )}
        </div>

        <footer className="sheet-footer">
          <button className="secondary-button" onClick={onClose}>
            {copy.common.close}
          </button>
          <button className="primary-button" onClick={onEdit}>
            <Edit2 size={18} strokeWidth={2.2} />
            {copy.common.edit}
          </button>
        </footer>
      </motion.section>
    </motion.div>
  );
}
