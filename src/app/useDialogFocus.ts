import {
  useEffect,
  useRef,
  type RefObject,
} from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const useDialogFocus = <T extends HTMLElement>({
  isOpen = true,
  onEscape,
  restoreFocusId,
}: {
  isOpen?: boolean;
  onEscape: () => void;
  restoreFocusId?: string;
}): RefObject<T | null> => {
  const containerRef = useRef<T | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const restoreFocusIdRef = useRef('');
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    restoreFocusIdRef.current =
      restoreFocusId ?? restoreFocusRef.current?.id ?? '';
    const frame = window.requestAnimationFrame(() => {
      const first = containerRef.current?.querySelector<HTMLElement>(
        FOCUSABLE_SELECTOR,
      );
      (first ?? containerRef.current)?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!containerRef.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          FOCUSABLE_SELECTOR,
        ),
      ).filter(
        (element) =>
          element.getAttribute('aria-hidden') !== 'true' &&
          element.offsetParent !== null,
      );
      if (!focusable.length) {
        event.preventDefault();
        containerRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      const restoreTarget = restoreFocusRef.current;
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (
            restoreTarget?.isConnected &&
            restoreTarget !== document.body &&
            restoreTarget !== document.documentElement
          ) {
            restoreTarget.focus();
            return;
          }
          const replacement = restoreFocusIdRef.current
            ? document.getElementById(restoreFocusIdRef.current)
            : null;
          replacement?.focus();
        });
      });
    };
  }, [isOpen, restoreFocusId]);

  return containerRef;
};
