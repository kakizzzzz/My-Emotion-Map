import { MapPin, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useAppLanguage } from "../../i18n";
import { type LocationRequestState } from "../../useLocationController";
import { useDialogFocus } from '../../app/useDialogFocus';

export function LocationPermissionPrompt({
  isOpen,
  requestState,
  onClose,
  onRequest,
}: {
  isOpen: boolean;
  requestState: LocationRequestState;
  onClose: () => void;
  onRequest: () => void;
}) {
  const { copy } = useAppLanguage();
  const isRequesting = requestState === 'requesting';
  const dialogRef = useDialogFocus<HTMLElement>({
    isOpen,
    onEscape: () => {
      if (!isRequesting) onClose();
    },
  });
  const errorText =
    requestState === 'insecure'
      ? copy.location.permissionInsecure
      : requestState === 'unsupported'
        ? copy.location.permissionUnsupported
        : requestState === 'denied'
          ? copy.location.permissionDenied
          : requestState === 'timeout'
            ? copy.location.permissionTimeout
            : requestState === 'unavailable'
              ? copy.location.permissionUnavailable
              : '';

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="location-permission-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.section
            ref={dialogRef}
            className="location-permission-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-permission-title"
            aria-describedby="location-permission-description"
            aria-busy={isRequesting}
            tabIndex={-1}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <header className="location-permission-header">
              <h2 id="location-permission-title">
                <MapPin size={22} strokeWidth={2.2} />
                {copy.location.initialTitle}
              </h2>
              <button
                type="button"
                className="popup-close-button"
                onClick={onClose}
                aria-label={copy.common.close}
                disabled={isRequesting}
              >
                <X size={19} strokeWidth={2.2} />
              </button>
            </header>
            <p id="location-permission-description">
              {copy.location.initialBody}
            </p>
            {errorText ? <div role="alert">{errorText}</div> : null}
            <footer>
              <button type="button" onClick={onClose} disabled={isRequesting}>
                {copy.common.notNow}
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={onRequest}
                disabled={isRequesting}
              >
                {isRequesting
                  ? copy.location.permissionRequesting
                  : errorText
                    ? copy.common.retry
                    : copy.location.allowLocation}
              </button>
            </footer>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
