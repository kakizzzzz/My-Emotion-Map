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

type PointerGesture = {
  pointerId: number;
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

export function useNoteWizardGestures(onNavigate: NavigateWizard) {
  const navigateRef = useRef(onNavigate);
  const pointerRef = useRef<PointerGesture | null>(null);
  const suppressClickUntilRef = useRef(0);
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

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (
      event.pointerType === 'mouse' ||
      event.button !== 0 ||
      isTextEditingTarget(event.target)
    ) return;
    pointerRef.current = {
      pointerId: event.pointerId,
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
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    const distanceX = event.clientX - gesture.startX;
    const distanceY = event.clientY - gesture.startY;
    const absoluteX = Math.abs(distanceX);
    const absoluteY = Math.abs(distanceY);
    if (gesture.axis === 'pending') {
      if (Math.max(absoluteX, absoluteY) < AXIS_LOCK_DISTANCE) return;
      if (absoluteX > absoluteY * 1.15) gesture.axis = 'horizontal';
      else if (absoluteY > absoluteX * 1.15) gesture.axis = 'vertical';
      else return;
    }
    if (gesture.axis === 'horizontal' && event.cancelable) {
      event.preventDefault();
    }
  }, []);

  const finishPointer = useCallback((
    event: ReactPointerEvent<HTMLElement>,
    cancelled: boolean,
  ) => {
    const gesture = pointerRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    pointerRef.current = null;
    if (cancelled || gesture.axis !== 'horizontal') return;
    const endX = Number.isFinite(event.clientX) ? event.clientX : gesture.lastX;
    const distanceX = endX - gesture.startX;
    const absoluteX = Math.abs(distanceX);
    const duration = Math.max(1, performance.now() - gesture.startedAt);
    const velocity = absoluteX / duration;
    const viewportThreshold = Math.min(
      72,
      Math.max(44, event.currentTarget.clientWidth * 0.1),
    );
    const completed = absoluteX >= viewportThreshold ||
      (absoluteX >= SWIPE_MIN_DISTANCE && velocity >= SWIPE_VELOCITY);
    if (!completed) return;
    suppressClickUntilRef.current = performance.now() + CLICK_SUPPRESSION_MS;
    navigateRef.current(distanceX < 0 ? 1 : -1);
  }, []);

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
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
    onWheel,
  };
}
