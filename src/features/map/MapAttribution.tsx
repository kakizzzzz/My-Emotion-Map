import { useAppLanguage } from '../../i18n';
import { MAP_STYLES } from './mapPreferences';

export function MapAttribution({
  mapStyle,
}: {
  mapStyle: keyof typeof MAP_STYLES;
}) {
  const { copy } = useAppLanguage();
  return (
    <div className="map-attribution" aria-label={copy.map.mapDataSource}>
      {mapStyle === 'aerial' ? (
        <>
          <a
            href="https://versatiles.org/sources/"
            target="_blank"
            rel="noreferrer"
          >
            VersaTiles sources
          </a>{' '}
          · ©{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap contributors
          </a>
        </>
      ) : (
        <>
          <a
            href="https://openfreemap.org/"
            target="_blank"
            rel="noreferrer"
          >
            OpenFreeMap
          </a>{' '}
          ©{' '}
          <a
            href="https://openmaptiles.org/"
            target="_blank"
            rel="noreferrer"
          >
            OpenMapTiles
          </a>{' '}
          Data from{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap
          </a>
        </>
      )}
    </div>
  );
}
