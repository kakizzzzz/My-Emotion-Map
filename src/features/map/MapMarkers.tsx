import { useRef } from 'react';
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

function SavedMomentMarker({
  moment,
  selected,
  isTagging,
  onSelectMoment,
}: {
  moment: EmotionMoment;
  selected: boolean;
  isTagging: boolean;
  onSelectMoment: (momentId: string) => void;
}) {
  const { copy, language } = useAppLanguage();
  const touchRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClickUntilRef = useRef(0);

  return (
    <Marker
      longitude={moment.longitude}
      latitude={moment.latitude}
      anchor="center"
    >
      <div className="map-star-anchor" data-moment-id={moment.id}>
        <motion.button
          className="map-star-button"
          initial={moment.isNew ? { opacity: 0, scale: 0.6 } : false}
          animate={{ opacity: 1, scale: 1 }}
          whileTap={{ scale: 0.94 }}
          transition={moment.isNew ? MOTION.placement : MOTION.press}
          onClick={(event) => {
            event.stopPropagation();
            if (performance.now() < suppressClickUntilRef.current) return;
            onSelectMoment(moment.id);
          }}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse' || !event.isPrimary) return;
            touchRef.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              moved: false,
            };
            if (isTagging) event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const touch = touchRef.current;
            if (!touch || touch.id !== event.pointerId) return;
            if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) >= 16) {
              touch.moved = true;
            }
          }}
          onPointerUp={(event) => {
            const touch = touchRef.current;
            if (!touch || touch.id !== event.pointerId) return;
            touchRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            suppressClickUntilRef.current = performance.now() + 700;
            if (!touch.moved) {
              event.stopPropagation();
              onSelectMoment(moment.id);
            }
          }}
          onPointerCancel={(event) => {
            touchRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
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
}: {
  moments: EmotionMoment[];
  selectedId: string | null;
  mapStyle: keyof typeof MAP_STYLES;
  tagLine: object;
  isTagging: boolean;
  userLocation: UserLocation | null;
  starDragPreview: CoordinatePair | null;
  onSelectMoment: (momentId: string) => void;
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
        />
      ))}
    </>
  );
}
