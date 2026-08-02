import { useState } from "react";
import { ChevronDown, Inbox, MapPin, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { MOTION } from "../../motion";
import { StarMarkerGlyph } from "../../StarMarkerGlyph";
import { useAppLanguage } from "../../i18n";
import { formatFollowUpTimestamp } from '../../domain/followUps';
import type {
  StarInboxItem,
} from '../../types';
import { useDialogFocus } from '../../app/useDialogFocus';

export function StarInboxScreen({
  items,
  onReviewItem,
  onDismissItem,
  onMarkSeen,
  onClose,
}: {
  items: StarInboxItem[];
  onReviewItem: (item: StarInboxItem) => void;
  onDismissItem: (itemId: string) => void;
  onMarkSeen: (itemId: string) => void;
  onClose: () => void;
}) {
  const { copy, locale } = useAppLanguage();
  const pendingItems = items.filter((item) => item.status === 'pending');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const isEmpty = pendingItems.length === 0;
  const dialogRef = useDialogFocus<HTMLDivElement>({ onEscape: onClose });

  return (
    <section
      className="paper-screen star-inbox-screen"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
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
          {isEmpty ? (
            <div className="star-inbox-empty">
              <span>
                <Inbox size={28} strokeWidth={2.2} />
              </span>
              <h2>{copy.inbox.emptyTitle}</h2>
              <p>{copy.inbox.emptyBody}</p>
            </div>
          ) : (
            <>
              {pendingItems.length ? (
                <section
                  className="star-inbox-group"
                  aria-label={copy.inbox.discoveries}
                >
                  <h2 className="star-inbox-group__title">
                    {copy.inbox.discoveries}
                  </h2>
                  <div className="star-inbox-list">
                    {pendingItems.map((item) => {
                      const selectedKey = `health:${item.id}`;
                      const expanded = selectedItemId === selectedKey;
                      return (
                        <article
                          key={item.id}
                          className={`star-inbox-entry ${expanded ? 'is-open' : ''}`}
                        >
                          <button
                            className="star-inbox-card"
                            onClick={() => {
                              if (!expanded) onMarkSeen(item.id);
                              setSelectedItemId((current) =>
                                current === selectedKey ? null : selectedKey,
                              );
                            }}
                            aria-expanded={expanded}
                            aria-controls={`star-inbox-decision-${item.id}`}
                          >
                            <span className="star-inbox-card__icon">
                              <StarMarkerGlyph
                                size={34}
                                color="var(--em-dark)"
                                outline
                              />
                            </span>
                            <span className="star-inbox-card__copy">
                              <strong>{copy.inbox.discoveredStar}</strong>
                              <small className="star-inbox-card__status">
                                {item.decisionReason === 'outside_range' ||
                                item.decisionReason === 'outside_resting_range'
                                  ? copy.inbox.decisionOutside(item.heartRate)
                                  : item.decisionReason === 'outside_range_single_sample' ||
                                  item.decisionReason === 'low_signal_review'
                                    ? copy.inbox.decisionLowSignal(item.heartRate)
                                    : item.decisionReason === 'post_workout_review' ||
                                    item.decisionReason === 'unknown_strict_review' ||
                                    item.decisionReason === 'non_resting_review'
                                      ? copy.inbox.decisionNonResting(item.heartRate)
                                      : item.decisionReason === 'pending_test' ||
                                      item.decisionReason === 'test_event'
                                        ? copy.inbox.decisionTest(item.heartRate)
                                        : copy.inbox.decisionLegacy(item.heartRate)}
                              </small>
                              <small>
                                {formatFollowUpTimestamp(item.eventAt, locale)}
                              </small>
                              <em>
                                <MapPin size={12} strokeWidth={2.2} />
                                {typeof item.latitude === 'number' && typeof item.longitude === 'number'
                                  ? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`
                                  : copy.inbox.locationPending}
                              </em>
                            </span>
                            <ChevronDown size={20} strokeWidth={2.2} />
                          </button>
                          <AnimatePresence initial={false}>
                            {expanded ? (
                              <motion.div
                                id={`star-inbox-decision-${item.id}`}
                                className="star-inbox-decision"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.16 }}
                              >
                                <p>{copy.inbox.placeQuestion}</p>
                                <div>
                                  <button
                                    onClick={() => {
                                      onDismissItem(item.id);
                                      setSelectedItemId(null);
                                    }}
                                  >
                                    {copy.inbox.dismissPlacement}
                                  </button>
                                  <button onClick={() => onReviewItem(item)}>
                                    {copy.inbox.placeOnMap}
                                  </button>
                                </div>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </>
          )}
          {pendingItems.length ? (
            <p className="star-inbox-disclaimer">
              {copy.inbox.healthDisclaimer}
            </p>
          ) : null}
        </div>
      </motion.div>
    </section>
  );
}
