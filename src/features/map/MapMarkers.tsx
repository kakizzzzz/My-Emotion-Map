import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Layer, Marker, Source } from 'react-map-gl/maplibre';
import { motion } from 'motion/react';
import { EmotionStar } from '../../EmotionStar';
import { MapLocationMarker } from '../../MapLocationMarker';
import { MOTION } from '../../motion';
import { StarMarkerGlyph } from '../../StarMarkerGlyph';
import { useAppLanguage } from '../../i18n';
import { getEmotionLabel } from '../../domain/notePrompts';
import type { EmotionMoment } from '../../types';
import type { UserLocation } from '../../useLocationController';
import type { CoordinatePair } from './coordinateTransforms';
import { MAP_STYLES } from './mapPreferences';

const STAR_TOUCH_TOLERANCE = 16;
const NATIVE_CLICK_SUPPRESSION_MS = 700;

function SavedMomentMarker({
  moment,
  selected,
  isTagging,
  onSelectMoment,
  onDragStart,
  onMoveMoment,
}: {
  moment: EmotionMoment;
  selected: boolean;
  isTagging: boolean;
  onSelectMoment: (momentId: string) => void;
  onDragStart: (momentId: string) => void;
  onMoveMoment: (momentId: string, latitude: number, longitude: number) => void;
}) {
  const { copy, language } = useAppLanguage();
  const touchRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClickUntilRef = useRef(0);
  const isDraggingRef = useRef(false);
  const onSelectMomentRef = useRef(onSelectMoment);
  const [markerPosition, setMarkerPosition] = useState({
    latitude: moment.latitude,
    longitude: moment.longitude,
  });

  useEffect(() => {
    onSelectMomentRef.current = onSelectMoment;
  }, [onSelectMoment]);

  useEffect(() => {
    if (isDraggingRef.current) return;
    setMarkerPosition({
      latitude: moment.latitude,
      longitude: moment.longitude,
    });
  }, [moment.latitude, moment.longitude]);

  const releasePointerCapture = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <Marker
      longitude={markerPosition.longitude}
      latitude={markerPosition.latitude}
      anchor="center"
      draggable={!isTagging}
      clickTolerance={STAR_TOUCH_TOLERANCE}
      onClick={(event) => {
        event.originalEvent.stopPropagation();
        if (performance.now() < suppressClickUntilRef.current) return;
        onSelectMomentRef.current(moment.id);
      }}
      onDragStart={() => {
        isDraggingRef.current = true;
        if (touchRef.current) touchRef.current.moved = true;
        suppressClickUntilRef.current =
          performance.now() + NATIVE_CLICK_SUPPRESSION_MS;
        onDragStart(moment.id);
      }}
      onDrag={(event) => {
        setMarkerPosition({
          latitude: event.lngLat.lat,
          longitude: event.lngLat.lng,
        });
      }}
      onDragEnd={(event) => {
        const next = {
          latitude: event.lngLat.lat,
          longitude: event.lngLat.lng,
        };
        setMarkerPosition(next);
        isDraggingRef.current = false;
        suppressClickUntilRef.current =
          performance.now() + NATIVE_CLICK_SUPPRESSION_MS;
        onMoveMoment(moment.id, next.latitude, next.longitude);
      }}
    >
      <div className="map-star-anchor" data-moment-id={moment.id}>
        <motion.button
          className="map-star-button"
          initial={moment.isNew ? { opacity: 0, scale: 0.6 } : false}
          animate={{ opacity: 1, scale: 1 }}
          whileTap={{ scale: 0.94 }}
          transition={moment.isNew ? MOTION.placement : MOTION.press}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse' || !event.isPrimary) return;
            touchRef.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              moved: false,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const touch = touchRef.current;
            if (!touch || touch.id !== event.pointerId) return;
            const movement = Math.abs(event.clientX - touch.x) +
              Math.abs(event.clientY - touch.y);
            if (movement >= STAR_TOUCH_TOLERANCE) {
              touch.moved = true;
            }
          }}
          onPointerUp={(event) => {
            const touch = touchRef.current;
            if (!touch || touch.id !== event.pointerId) return;
            touchRef.current = null;
            releasePointerCapture(event);
            const shouldSelect = !touch.moved && !isDraggingRef.current &&
              performance.now() >= suppressClickUntilRef.current;
            suppressClickUntilRef.current =
              performance.now() + NATIVE_CLICK_SUPPRESSION_MS;
            if (shouldSelect) {
              event.stopPropagation();
              queueMicrotask(() => onSelectMomentRef.current(moment.id));
            }
          }}
          onPointerCancel={(event) => {
            touchRef.current = null;
            releasePointerCapture(event);
            suppressClickUntilRef.current =
              performance.now() + NATIVE_CLICK_SUPPRESSION_MS;
          }}
          aria-label={
            moment.isNew
              ? copy.map.newStar
              : `${moment.place}, ${getEmotionLabel(moment.emotion, language)}`
          }
        >
          <EmotionStar
            emotion={moment.emotion}
            size={36}
            order={moment.tagOrder}
            selected={selected}
            colorOverride={moment.color}
          />
        </motion.button>
      </div>
    </Marker>
  );
}

export function MapMarkers({
  moments,
  selectedId,
  mapStyle,
  tagLine,
  isTagging,
  userLocation,
  starDragPreview,
  onSelectMoment,
  onMomentDragStart,
  onMoveMoment,
}: {
  moments: EmotionMoment[];
  selectedId: string | null;
  mapStyle: keyof typeof MAP_STYLES;
  tagLine: object;
  isTagging: boolean;
  userLocation: UserLocation | null;
  starDragPreview: CoordinatePair | null;
  onSelectMoment: (momentId: string) => void;
  onMomentDragStart: (momentId: string) => void;
  onMoveMoment: (momentId: string, latitude: number, longitude: number) => void;
}) {
  const { copy } = useAppLanguage();

  return (
    <>
      <Source id="tag-lines" type="geojson" data={tagLine as never}>
        <Layer
          id="tag-lines-layer"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color':
              mapStyle === 'aerial' ? '#ffffff' : '#c3c3c3',
            'line-width': 2.5,
            'line-opacity': 1,
            'line-dasharray': [0.4, 4],
          }}
        />
      </Source>

      {userLocation ? (
        <Marker
          longitude={userLocation.lng}
          latitude={userLocation.lat}
          anchor="center"
          style={{ pointerEvents: 'none' }}
        >
          <div
            className="current-location-marker"
            aria-label={`${copy.map.currentLocation}, ${
              userLocation.accuracy === null
                ? copy.location.accuracyUnknown
                : copy.location.accuracy(
                    Math.round(userLocation.accuracy),
                  )
            }`}
          >
            <MapLocationMarker
              size={80}
              color={
                mapStyle === 'aerial' ? '#ffffff' : '#c3c3c3'
              }
              heading={userLocation.heading}
            />
          </div>
        </Marker>
      ) : null}

      {starDragPreview ? (
        <Marker
          longitude={starDragPreview.lng}
          latitude={starDragPreview.lat}
          anchor="center"
        >
          <div className="drag-star-preview" aria-hidden="true">
            <StarMarkerGlyph size={36} color="#EDC727" />
          </div>
        </Marker>
      ) : null}

      {moments.map((moment) => (
        <SavedMomentMarker
          key={moment.id}
          moment={moment}
          selected={selectedId === moment.id}
          isTagging={isTagging}
          onSelectMoment={onSelectMoment}
          onDragStart={onMomentDragStart}
          onMoveMoment={onMoveMoment}
        />
      ))}
    </>
  );
}
