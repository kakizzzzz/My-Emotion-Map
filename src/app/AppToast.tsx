import { AnimatePresence, motion } from 'motion/react';
import type { ToastNotice } from './appTypes';

export function AppToast({
  notice,
  onDismiss,
}: {
  notice: ToastNotice | null;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      {notice ? (
        <motion.div
          key={notice.id}
          className={`toast toast--${notice.placement}`}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.12 }}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span>{notice.message}</span>
          {notice.actionLabel && notice.onAction ? (
            <button
              type="button"
              onClick={() => {
                notice.onAction?.();
                onDismiss();
              }}
            >
              {notice.actionLabel}
            </button>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
