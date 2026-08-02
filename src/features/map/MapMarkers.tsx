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
  onSelectMoment,
}: {
  moment: EmotionMoment;
  selected: boolean;
  onSelectMoment: (momentId: string) => void;
}) {
  const { copy, language } = useAppLanguage();

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
            onSelectMoment(moment.id);
          }}
          aria-label={
            moment.isNew
              ? typeof moment.heartRate === 'number'
                ? copy.map.newHeartRateStar(moment.heartRate)
                : copy.map.newStar
              : `${moment.place}, ${getEmotionLabel(moment.emotion, language)}`
          }
        >
          {moment.isNew ? (
            <StarMarkerGlyph size={36} color="#EDC727" />
          ) : (
            <EmotionStar
              emotion={moment.emotion}
              size={36}
              order={moment.tagOrder}
              selected={selected}
              colorOverride={moment.color}
            />
          )}
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
  userLocation,
  starDragPreview,
  onSelectMoment,
}: {
  moments: EmotionMoment[];
  selectedId: string | null;
  mapStyle: keyof typeof MAP_STYLES;
  tagLine: object;
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
          onSelectMoment={onSelectMoment}
        />
      ))}
    </>
  );
}
