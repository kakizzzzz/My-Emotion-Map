import type { DataMode, EmotionMoment, MapViewport } from '../../types';

const NEUTRAL_VIEWPORT: MapViewport = {
  longitude: 0,
  latitude: 18,
  zoom: 1.8,
};

const fitMoments = (moments: EmotionMoment[]): MapViewport => {
  const longitudes = moments.map((moment) => moment.longitude);
  const latitudes = moments.map((moment) => moment.latitude);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const span = Math.max(east - west, north - south, 0.0008);
  const zoom = Math.min(17, Math.max(2, Math.log2(180 / span) - 1.2));
  return {
    longitude: (west + east) / 2,
    latitude: (south + north) / 2,
    zoom,
  };
};

export const resolveInitialViewport = ({
  dataMode,
  moments,
  savedViewport,
}: {
  dataMode: DataMode;
  moments: EmotionMoment[];
  savedViewport?: MapViewport;
}): MapViewport => {
  if (dataMode === 'real' && savedViewport) return savedViewport;
  if (moments.length) return fitMoments(moments);
  return NEUTRAL_VIEWPORT;
};
