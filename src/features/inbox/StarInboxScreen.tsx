import { useState } from 'react';
import { ChevronDown, Inbox, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { EmotionStar } from '../../EmotionStar';
import { MOTION } from '../../motion';
import { useAppLanguage } from '../../i18n';
import type { ChatOption, EmotionNote, FollowUpRecord } from '../../types';
import {
  formatFollowUpTimestamp,
  getFollowUpOptions,
  getFollowUpPrompt,
  isInboxFollowUp,
} from '../../domain/followUps';
import { useDialogFocus } from '../../app/useDialogFocus';

export function StarInboxScreen({
  followUps,
  notes,
  onAnswerFollowUp,
  onClose,
}: {
  followUps: FollowUpRecord[];
  notes: EmotionNote[];
  onAnswerFollowUp: (
    followUpId: string,
    label: string,
    kind: ChatOption['responseKind'],
  ) => void;
  onClose: () => void;
}) {
  const { copy, language, locale } = useAppLanguage();
  const [openedAt] = useState(() => Date.now());
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const followUpOptions = getFollowUpOptions(language);
  const queuedFollowUps = followUps
    .filter((record) => isInboxFollowUp(record, openedAt))
    .sort(
      (left, right) =>
        new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime(),
    );
  const dialogRef = useDialogFocus<HTMLDivElement>({ onEscape: onClose });

  return (
    <section className="paper-screen star-inbox-screen">
      <motion.div
        ref={dialogRef}
        className="star-inbox-paper"
        role="dialog"
        aria-modal="true"
        aria-labelledby="star-inbox-title"
        tabIndex={-1}
        initial={{ y: 38, opacity: 0.92 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={MOTION.sheet}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="star-inbox-header">
          <h1 id="star-inbox-title">{copy.inbox.title}</h1>
          <button
            className="icon-button popup-close-button"
            onClick={onClose}
            aria-label={copy.common.close}
          >
            <X size={19} strokeWidth={2.2} />
          </button>
        </header>

        <div className="star-inbox-content">
          {!queuedFollowUps.length ? (
            <div className="star-inbox-empty">
              <span><Inbox size={28} strokeWidth={2.2} /></span>
              <h2>{copy.inbox.emptyTitle}</h2>
              <p>{copy.inbox.emptyBody}</p>
            </div>
          ) : (
            <section className="star-inbox-group" aria-label={copy.inbox.followUps}>
              <h2 className="star-inbox-group__title">{copy.inbox.followUps}</h2>
              <div className="star-inbox-list">
                {queuedFollowUps.map((record) => {
                  const expanded = selectedItemId === record.id;
                  const note = notes.find((item) => item.id === record.noteId);
                  return (
                    <article
                      key={record.id}
                      className={`star-inbox-entry ${expanded ? 'is-open' : ''}`}
                    >
                      <button
                        className="star-inbox-card star-inbox-card--follow-up"
                        onClick={() => setSelectedItemId(expanded ? null : record.id)}
                        aria-expanded={expanded}
                        aria-controls={`follow-up-decision-${record.id}`}
                      >
                        <span className="star-inbox-card__icon">
                          <EmotionStar
                            emotion={note?.emotion ?? null}
                            size={34}
                            colorOverride={note?.color}
                          />
                        </span>
                        <span className="star-inbox-card__copy">
                          <strong>{note?.title || copy.note.untitled}</strong>
                          <small className="star-inbox-card__status">
                            {copy.inbox.followUpAfterDays(record.intervalDays)}
                          </small>
                          <small>{formatFollowUpTimestamp(record.dueAt, locale)}</small>
                        </span>
                        <ChevronDown size={20} strokeWidth={2.2} />
                      </button>
                      <AnimatePresence initial={false}>
                        {expanded ? (
                          <motion.div
                            id={`follow-up-decision-${record.id}`}
                            className="star-inbox-decision star-inbox-follow-up-decision"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.16 }}
                          >
                            <p>{note ? getFollowUpPrompt(record, note, language) : ''}</p>
                            <div>
                              {followUpOptions.map((option) => (
                                <button
                                  key={option.id}
                                  onClick={() => {
                                    onAnswerFollowUp(record.id, option.label, option.responseKind);
                                    setSelectedItemId(null);
                                  }}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </motion.div>
    </section>
  );
}
