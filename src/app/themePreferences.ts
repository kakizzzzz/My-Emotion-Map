import type { CSSProperties } from 'react';
import type { ThemePalette, ThemeTone } from '../types';

export const THEME_PRESETS: Array<{
  key: ThemeTone;
  label: string;
  colors: ThemePalette;
}> = [
  {
    key: 'original',
    label: '初始',
    colors: {
      page: '#F3F3F3',
      card: '#D9D9D9',
      icon: '#C3C3C3',
      dark: '#5C5C5C',
    },
  },
  {
    key: 'terracotta',
    label: '陶土',
    colors: {
      page: '#FAF4F0',
      card: '#E8D7CD',
      icon: '#B98A78',
      dark: '#6A5048',
    },
  },
  {
    key: 'blue',
    label: '清蓝',
    colors: {
      page: '#F4F8FA',
      card: '#D7E7EE',
      icon: '#8AAEBC',
      dark: '#405D6B',
    },
  },
  {
    key: 'mauve',
    label: '雾紫',
    colors: {
      page: '#F8F5F8',
      card: '#E8DAE8',
      icon: '#A994AA',
      dark: '#5D4D62',
    },
  },
];

export const DEFAULT_THEME = THEME_PRESETS[0].colors;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const toRgb = (color: string) => {
  if (!HEX_COLOR.test(color)) return null;
  return {
    red: Number.parseInt(color.slice(1, 3), 16),
    green: Number.parseInt(color.slice(3, 5), 16),
    blue: Number.parseInt(color.slice(5, 7), 16),
  };
};

const luminance = (color: string) => {
  const rgb = toRgb(color);
  if (!rgb) return null;
  const channels = [rgb.red, rgb.green, rgb.blue].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

export const getContrastRatio = (foreground: string, background: string) => {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) return 0;
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
};

export const isThemePalette = (value: unknown): value is ThemePalette => {
  if (!value || typeof value !== 'object') return false;
  const palette = value as Partial<ThemePalette>;
  return (
    typeof palette.page === 'string' &&
    HEX_COLOR.test(palette.page) &&
    typeof palette.card === 'string' &&
    HEX_COLOR.test(palette.card) &&
    typeof palette.icon === 'string' &&
    HEX_COLOR.test(palette.icon) &&
    typeof palette.dark === 'string' &&
    HEX_COLOR.test(palette.dark)
  );
};

export const getThemeStyle = (
  palette: ThemePalette,
): CSSProperties => {
  const isOriginal = (
    Object.keys(DEFAULT_THEME) as Array<keyof ThemePalette>
  ).every(
    (key) => palette[key].toLowerCase() === DEFAULT_THEME[key].toLowerCase(),
  );
  return {
    '--em-page': palette.page,
    '--em-card': palette.card,
    '--em-icon': palette.icon,
    '--em-dark': palette.dark,
    '--em-active-surface': isOriginal
      ? '#ffffff'
      : `color-mix(in srgb, ${palette.page} 58%, white)`,
    '--em-card-surface': isOriginal
      ? 'rgba(255, 255, 255, 0.8)'
      : `color-mix(in srgb, ${palette.card} 68%, white)`,
    '--em-chrome-surface': isOriginal
      ? 'rgba(255, 255, 255, 0.95)'
      : `color-mix(in srgb, ${palette.page} 76%, white)`,
    '--em-soft-surface': isOriginal
      ? 'rgba(255, 255, 255, 0.55)'
      : `color-mix(in srgb, ${palette.page} 62%, white)`,
    '--em-soft-card': isOriginal
      ? 'rgba(255, 255, 255, 0.6)'
      : `color-mix(in srgb, ${palette.card} 56%, white)`,
  } as CSSProperties;
};
