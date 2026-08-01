import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import type { CoordinatePair } from './coordinateTransforms';

type MapInteractionControllerOptions = {
  isLocationRequesting: boolean;
  onDropStar: (coordinate: CoordinatePair) => void;
};

export function useMapInteractionController({
  isLocationRequesting,
  onDropStar,
}: MapInteractionControllerOptions) {
  const mapRef = useRef<MapRef | null>(null);
  const onDropStarRef = useRef(onDropStar);
  const starPointerStartRef = useRef<{ x: number; y: number } | null>(null);
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

  const resetDrag = useCallback(() => {
    starPointerStartRef.current = null;
    starDragActiveRef.current = false;
    starDragPreviewRef.current = null;
    setStarDragPreview(null);
    clearDragListeners();
  }, [clearDragListeners]);

  const updateStarDragAt = useCallback((clientX: number, clientY: number) => {
    const start = starPointerStartRef.current;
    const map = mapRef.current;
    if (!start || !map) return;
    const distance = Math.hypot(clientX - start.x, clientY - start.y);
    if (distance < 6 && !starDragActiveRef.current) return;
    starDragActiveRef.current = true;
    const bounds = map.getContainer().getBoundingClientRect();
    const point = map.unproject([clientX - bounds.left, clientY - bounds.top]);
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
      }, 0);
    }
    resetDrag();
  }, [resetDrag]);

  const beginStarDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (isLocationRequesting || starPointerStartRef.current) return;
      starPointerStartRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
      starDragActiveRef.current = false;
      starDragPreviewRef.current = null;

      const move = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault();
        updateStarDragAt(moveEvent.clientX, moveEvent.clientY);
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', finishStarDrag);
      window.addEventListener('pointercancel', resetDrag);
      starDragCleanupRef.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finishStarDrag);
        window.removeEventListener('pointercancel', resetDrag);
      };
    },
    [finishStarDrag, isLocationRequesting, resetDrag, updateStarDragAt],
  );

  const beginStarMouseDrag = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (isLocationRequesting || starPointerStartRef.current) return;
      starPointerStartRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
      starDragActiveRef.current = false;
      starDragPreviewRef.current = null;

      const move = (moveEvent: MouseEvent) => {
        moveEvent.preventDefault();
        updateStarDragAt(moveEvent.clientX, moveEvent.clientY);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', finishStarDrag);
      starDragCleanupRef.current = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', finishStarDrag);
      };
    },
    [finishStarDrag, isLocationRequesting, updateStarDragAt],
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
    beginStarMouseDrag,
  };
}
