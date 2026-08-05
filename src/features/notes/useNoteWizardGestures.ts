import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';

type WizardDirection = -1 | 1;
type NavigateWizard = (direction: WizardDirection) => boolean;
type GestureAxis = 'pending' | 'horizontal' | 'vertical';

type SwipeGesture = {
  identifier: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startedAt: number;
  axis: GestureAxis;
};

const AXIS_LOCK_DISTANCE = 8;
const SWIPE_MIN_DISTANCE = 24;
const SWIPE_VELOCITY = 0.45;
const WHEEL_THRESHOLD = 52;
const WHEEL_RESET_MS = 220;
const WHEEL_COOLDOWN_MS = 420;
const CLICK_SUPPRESSION_MS = 360;
const DUPLICATE_SWIPE_WINDOW_MS = 140;
const TEXT_EDITING_TARGET =
  'input, textarea, select, [contenteditable="true"]';

const isTextEditingTarget = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest(TEXT_EDITING_TARGET));

const hasFinePointer = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const activeWizardPage = (viewport: HTMLElement) =>
  viewport.querySelector<HTMLElement>('.note-wizard-page:not([inert])');

const pageCanScroll = (page: HTMLElement | null, delta: number) => {
  if (!page || page.scrollHeight <= page.clientHeight + 2) return false;
  if (delta > 0) {
    return page.scrollTop + page.clientHeight < page.scrollHeight - 2;
  }
  return page.scrollTop > 2;
};

const normalizedWheelDelta = (event: ReactWheelEvent<HTMLElement>) => {
  const raw = Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.1
    ? event.deltaX
    : event.deltaY;
  const unit = event.deltaMode === 1
    ? 16
    : event.deltaMode === 2
      ? Math.max(1, event.currentTarget.clientHeight)
      : 1;
  return raw * unit;
};

const updateGestureAxis = (
  gesture: SwipeGesture,
  clientX: number,
  clientY: number,
) => {
  gesture.lastX = clientX;
  gesture.lastY = clientY;
  if (gesture.axis !== 'pending') return gesture.axis;
  const absoluteX = Math.abs(clientX - gesture.startX);
  const absoluteY = Math.abs(clientY - gesture.startY);
  if (Math.max(absoluteX, absoluteY) < AXIS_LOCK_DISTANCE) return gesture.axis;
  if (absoluteX > absoluteY * 1.15) gesture.axis = 'horizontal';
  else if (absoluteY > absoluteX * 1.15) gesture.axis = 'vertical';
  return gesture.axis;
};

export function useNoteWizardGestures(onNavigate: NavigateWizard) {
  const navigateRef = useRef(onNavigate);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<SwipeGesture | null>(null);
  const touchRef = useRef<SwipeGesture | null>(null);
  const suppressClickUntilRef = useRef(0);
  const lastSwipeAtRef = useRef(0);
  const wheelTotalRef = useRef(0);
  const wheelSignRef = useRef(0);
  const wheelLockedUntilRef = useRef(0);
  const wheelResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    navigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => () => {
    if (wheelResetTimerRef.current !== null) {
      window.clearTimeout(wheelResetTimerRef.current);
    }
  }, []);

  const resetWheelAccumulator = useCallback(() => {
    wheelTotalRef.current = 0;
    wheelSignRef.current = 0;
    if (wheelResetTimerRef.current !== null) {
      window.clearTimeout(wheelResetTimerRef.current);
      wheelResetTimerRef.current = null;
    }
  }, []);

  const scheduleWheelReset = useCallback(() => {
    if (wheelResetTimerRef.current !== null) {
      window.clearTimeout(wheelResetTimerRef.current);
    }
    wheelResetTimerRef.current = window.setTimeout(() => {
      wheelResetTimerRef.current = null;
      wheelTotalRef.current = 0;
      wheelSignRef.current = 0;
    }, WHEEL_RESET_MS);
  }, []);

  const completeSwipe = useCallback((
    gesture: SwipeGesture,
    endX: number,
    viewportWidth: number,
  ) => {
    if (gesture.axis !== 'horizontal') return false;
    const distanceX = endX - gesture.startX;
    const absoluteX = Math.abs(distanceX);
    const duration = Math.max(1, performance.now() - gesture.startedAt);
    const velocity = absoluteX / duration;
    const viewportThreshold = Math.min(
      72,
      Math.max(44, viewportWidth * 0.1),
    );
    const completed = absoluteX >= viewportThreshold ||
      (absoluteX >= SWIPE_MIN_DISTANCE && velocity >= SWIPE_VELOCITY);
    if (!completed) return false;
    const now = performance.now();
    if (now - lastSwipeAtRef.current < DUPLICATE_SWIPE_WINDOW_MS) return false;
    const moved = navigateRef.current(distanceX < 0 ? 1 : -1);
    if (!moved) return false;
    lastSwipeAtRef.current = now;
    suppressClickUntilRef.current = now + CLICK_SUPPRESSION_MS;
    return true;
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const onTouchStart = (event: TouchEvent) => {
      suppressClickUntilRef.current = 0;
      if (event.touches.length !== 1 || isTextEditingTarget(event.target)) {
        touchRef.current = null;
        return;
      }
      const touch = event.touches[0];
      touchRef.current = {
        identifier: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        startedAt: performance.now(),
        axis: 'pending',
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const gesture = touchRef.current;
      if (!gesture) return;
      const touch = Array.from(event.touches).find(
        (candidate) => candidate.identifier === gesture.identifier,
      );
      if (!touch) return;
      const axis = updateGestureAxis(gesture, touch.clientX, touch.clientY);
      if (axis === 'horizontal' && event.cancelable) event.preventDefault();
    };

    const finishTouch = (event: TouchEvent, cancelled: boolean) => {
      const gesture = touchRef.current;
      if (!gesture) return;
      touchRef.current = null;
      if (cancelled) return;
      const touch = Array.from(event.changedTouches).find(
        (candidate) => candidate.identifier === gesture.identifier,
      );
      completeSwipe(
        gesture,
        touch?.clientX ?? gesture.lastX,
        viewport.clientWidth,
      );
    };

    const onTouchEnd = (event: TouchEvent) => finishTouch(event, false);
    const onTouchCancel = (event: TouchEvent) => finishTouch(event, true);

    viewport.addEventListener('touchstart', onTouchStart, { passive: true });
    viewport.addEventListener('touchmove', onTouchMove, { passive: false });
    viewport.addEventListener('touchend', onTouchEnd, { passive: true });
    viewport.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      viewport.removeEventListener('touchstart', onTouchStart);
      viewport.removeEventListener('touchmove', onTouchMove);
      viewport.removeEventListener('touchend', onTouchEnd);
      viewport.removeEventListener('touchcancel', onTouchCancel);
      touchRef.current = null;
    };
  }, [completeSwipe]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    suppressClickUntilRef.current = 0;
    if (
      event.pointerType === 'mouse' ||
      event.button !== 0 ||
      isTextEditingTarget(event.target)
    ) return;
    pointerRef.current = {
      identifier: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startedAt: performance.now(),
      axis: 'pending',
    };
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const gesture = pointerRef.current;
    if (!gesture || gesture.identifier !== event.pointerId) return;
    const axis = updateGestureAxis(gesture, event.clientX, event.clientY);
    if (axis === 'horizontal' && event.cancelable) event.preventDefault();
  }, []);

  const finishPointer = useCallback((
    event: ReactPointerEvent<HTMLElement>,
    cancelled: boolean,
  ) => {
    const gesture = pointerRef.current;
    if (!gesture || gesture.identifier !== event.pointerId) return;
    pointerRef.current = null;
    if (cancelled) return;
    completeSwipe(
      gesture,
      Number.isFinite(event.clientX) ? event.clientX : gesture.lastX,
      event.currentTarget.clientWidth,
    );
  }, [completeSwipe]);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    finishPointer(event, false);
  }, [finishPointer]);

  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    finishPointer(event, true);
  }, [finishPointer]);

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (performance.now() >= suppressClickUntilRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const onWheel = useCallback((event: ReactWheelEvent<HTMLElement>) => {
    if (
      !hasFinePointer() ||
      event.ctrlKey ||
      isTextEditingTarget(event.target)
    ) return;
    const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.1;
    const delta = normalizedWheelDelta(event);
    if (Math.abs(delta) < 1) return;
    if (
      !horizontalIntent &&
      pageCanScroll(activeWizardPage(event.currentTarget), delta)
    ) {
      resetWheelAccumulator();
      return;
    }
    event.preventDefault();
    const now = performance.now();
    if (now < wheelLockedUntilRef.current) return;
    const sign = Math.sign(delta);
    if (wheelSignRef.current !== 0 && sign !== wheelSignRef.current) {
      wheelTotalRef.current = 0;
    }
    wheelSignRef.current = sign;
    wheelTotalRef.current += delta;
    scheduleWheelReset();
    if (Math.abs(wheelTotalRef.current) < WHEEL_THRESHOLD) return;
    const direction: WizardDirection = wheelTotalRef.current > 0 ? 1 : -1;
    resetWheelAccumulator();
    if (navigateRef.current(direction)) {
      wheelLockedUntilRef.current = now + WHEEL_COOLDOWN_MS;
    }
  }, [resetWheelAccumulator, scheduleWheelReset]);

  return {
    ref: viewportRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
    onWheel,
  };
}
