import { useState } from 'react';
import { Clock3, MapPinned, MessageCircle, Star } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useDialogFocus } from '../../app/useDialogFocus';
import { useAppLanguage } from '../../i18n';
import { MOTION } from '../../motion';

export function FirstRunOnboarding({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const { copy } = useAppLanguage();
  const [page, setPage] = useState(0);
  const dialogRef = useDialogFocus<HTMLElement>({ onEscape: onComplete });
  const pages = [
    {
      title: copy.onboarding.recordTitle,
      body: copy.onboarding.recordBody,
      icon: Star,
      preview: 'star',
    },
    {
      title: copy.onboarding.contextTitle,
      body: copy.onboarding.contextBody,
      icon: MapPinned,
      preview: 'place',
    },
    {
      title: copy.onboarding.reflectTitle,
      body: copy.onboarding.reflectBody,
      icon: MessageCircle,
      preview: 'chat',
    },
  ] as const;
  const current = pages[page];
  const Icon = current.icon;

  return (
    <div className="first-run-onboarding-backdrop">
      <motion.section
        ref={dialogRef}
        className="first-run-onboarding"
        role="dialog"
        aria-modal="true"
        aria-label={current.title}
        tabIndex={-1}
        initial={{ opacity: 0, y: 18, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={MOTION.sheet}
      >
        <header>
          <span aria-live="polite">
            {copy.onboarding.progress(page + 1, pages.length)}
          </span>
          <button type="button" onClick={onComplete}>
            {copy.onboarding.skip}
          </button>
        </header>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.preview}
            className="onboarding-page"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
          >
            <div
              className={`onboarding-preview onboarding-preview--${current.preview}`}
              aria-hidden="true"
            >
              <Icon size={38} strokeWidth={1.9} />
              {current.preview === 'place' ? (
                <span className="onboarding-preview__time">
                  <Clock3 size={15} /> 15:10
                </span>
              ) : null}
              <div className="onboarding-preview__empty" />
            </div>
            <div className="onboarding-copy">
              <h2>{current.title}</h2>
              <p>{current.body}</p>
            </div>
          </motion.div>
        </AnimatePresence>

        <footer>
          <div className="onboarding-dots" aria-hidden="true">
            {pages.map((item, index) => (
              <i key={item.preview} className={index === page ? 'is-active' : ''} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              if (page === pages.length - 1) onComplete();
              else setPage((currentPage) => currentPage + 1);
            }}
          >
            {page === pages.length - 1
              ? copy.onboarding.finish
              : copy.onboarding.next}
          </button>
        </footer>
      </motion.section>
    </div>
  );
}
