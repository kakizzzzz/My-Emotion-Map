export const MAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/fiord',
  aerial: 'https://tiles.versatiles.org/assets/styles/satellite/style.json',
} as const;

export const MAP_STYLE_STORAGE_KEY = 'my-emotion-map.map-style.v1';

export const MAP_STYLE_ORDER: Array<keyof typeof MAP_STYLES> = [
  'aerial',
  'dark',
  'light',
];

export const loadMapStyle = (): keyof typeof MAP_STYLES => {
  try {
    const stored = window.localStorage.getItem(MAP_STYLE_STORAGE_KEY);
    return stored === 'dark' || stored === 'aerial' || stored === 'light'
      ? stored
      : 'light';
  } catch {
    return 'light';
  }
};
