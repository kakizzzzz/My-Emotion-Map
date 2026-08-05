import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import type { CoordinatePair } from './coordinateTransforms';

type MapInteractionControllerOptions = {
  isLocationRequesting: boolean;
  onDropStar: (coordinate: CoordinatePair) => void;
};

const STAR_DRAG_THRESHOLD_PX = 6;
const NATIVE_CLICK_SUPPRESSION_MS = 700;

export function useMapInteractionController({
  isLocationRequesting,
  onDropStar,
}: MapInteractionControllerOptions) {
  const mapRef = useRef<MapRef | null>(null);
  const onDropStarRef = useRef(onDropStar);
  const starPointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const starPointerIdRef = useRef<number | null>(null);
  const starPointerTargetRef = useRef<HTMLButtonElement | null>(null);
  const starGrabOffsetRef = useRef({ x: 0, y: 0 });
  const starDragActiveRef = useRef(false);
  const starDragPreviewRef = useRef<CoordinatePair | null>(null);
  const starDragCleanupRef = useRef<(() => void) | null>(null);
  const ignoreNextStarClickRef = useRef(false);
  const [starDragPreview, setStarDragPreview] =
    useState<CoordinatePair | null>(null);

  useEffect(() => {
    onDropStarRef.current = onDropStar;
  }, [onDropStar]);

  const moveMapTo = useCallback(
    (center: [number, number], zoom: number, duration = 650) => {
      const map = mapRef.current;
      if (!map) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        map.jumpTo({ center, zoom });
        return;
      }
      map.flyTo({ center, zoom, duration, essential: false });
    },
    [],
  );

  const clearDragListeners = useCallback(() => {
    starDragCleanupRef.current?.();
    starDragCleanupRef.current = null;
  }, []);

  const releaseStarPointer = useCallback(() => {
    const target = starPointerTargetRef.current;
    const pointerId = starPointerIdRef.current;
    if (target && pointerId !== null && target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
    starPointerTargetRef.current = null;
    starPointerIdRef.current = null;
  }, []);

  const resetDrag = useCallback(() => {
    starPointerStartRef.current = null;
    starDragActiveRef.current = false;
    starDragPreviewRef.current = null;
    setStarDragPreview(null);
    releaseStarPointer();
    clearDragListeners();
  }, [clearDragListeners, releaseStarPointer]);

  const updateStarDragAt = useCallback((clientX: number, clientY: number) => {
    const start = starPointerStartRef.current;
    const map = mapRef.current;
    if (!start || !map) return;
    const distance = Math.hypot(clientX - start.x, clientY - start.y);
    if (distance < STAR_DRAG_THRESHOLD_PX && !starDragActiveRef.current) return;
    starDragActiveRef.current = true;
    const bounds = map.getContainer().getBoundingClientRect();
    const point = map.unproject([
      clientX + starGrabOffsetRef.current.x - bounds.left,
      clientY + starGrabOffsetRef.current.y - bounds.top,
    ]);
    const coordinate = { lat: point.lat, lng: point.lng };
    starDragPreviewRef.current = coordinate;
    setStarDragPreview(coordinate);
  }, []);

  const finishStarDrag = useCallback(() => {
    const preview = starDragPreviewRef.current;
    if (starDragActiveRef.current && preview) {
      ignoreNextStarClickRef.current = true;
      onDropStarRef.current(preview);
      window.setTimeout(() => {
        ignoreNextStarClickRef.current = false;
      }, NATIVE_CLICK_SUPPRESSION_MS);
    }
    resetDrag();
  }, [resetDrag]);

  const beginStarDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (
        isLocationRequesting ||
        starPointerStartRef.current ||
        !event.isPrimary ||
        (event.pointerType === 'mouse' && event.button !== 0)
      ) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = event.currentTarget.getBoundingClientRect();
      starPointerStartRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
      starPointerIdRef.current = event.pointerId;
      starPointerTargetRef.current = event.currentTarget;
      starGrabOffsetRef.current = {
        x: bounds.left + bounds.width / 2 - event.clientX,
        y: bounds.top + bounds.height / 2 - event.clientY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      starDragActiveRef.current = false;
      starDragPreviewRef.current = null;

      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== starPointerIdRef.current) return;
        moveEvent.preventDefault();
        updateStarDragAt(moveEvent.clientX, moveEvent.clientY);
      };
      const finish = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== starPointerIdRef.current) return;
        finishStarDrag();
      };
      const cancel = (cancelEvent: PointerEvent) => {
        if (cancelEvent.pointerId !== starPointerIdRef.current) return;
        resetDrag();
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', cancel);
      starDragCleanupRef.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', cancel);
      };
    },
    [finishStarDrag, isLocationRequesting, resetDrag, updateStarDragAt],
  );

  useEffect(
    () => () => {
      clearDragListeners();
    },
    [clearDragListeners],
  );

  return {
    mapRef,
    starDragPreview,
    ignoreNextStarClickRef,
    moveMapTo,
    beginStarDrag,
  };
}
