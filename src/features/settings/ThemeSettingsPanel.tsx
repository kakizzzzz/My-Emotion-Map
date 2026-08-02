import { useState } from 'react';
import { Palette } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import { useAppLanguage } from '../../i18n';
import {
  THEME_PRESETS,
} from '../../app/themePreferences';
import { STAR_COLORS } from '../../domain/notePrompts';
import type { ThemePalette, ThemeTone } from '../../types';

export function ThemeSettingsPanel({
  themeTone,
  themePalette,
  onThemeTone,
  onThemeColor,
}: {
  themeTone: ThemeTone;
  themePalette: ThemePalette;
  onThemeTone: (tone: ThemeTone) => void;
  onThemeColor: (key: keyof ThemePalette, color: string) => void;
}) {
  const { copy } = useAppLanguage();
  const [activeColor, setActiveColor] =
    useState<keyof ThemePalette | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const controls: Array<{
    key: keyof ThemePalette;
    label: string;
  }> = [
    { key: 'page', label: copy.settings.themeLabels.page },
    { key: 'card', label: copy.settings.themeLabels.card },
    { key: 'icon', label: copy.settings.themeLabels.icon },
    { key: 'dark', label: copy.settings.themeLabels.dark },
  ];
  const presetLabels: Record<ThemeTone, string> = {
    original: copy.settings.themeLabels.original,
    terracotta: copy.settings.themeLabels.terracotta,
    blue: copy.settings.themeLabels.blue,
    mauve: copy.settings.themeLabels.mauve,
  };

  return (
    <section className="copied-settings-card theme-editor-card">
      <header>
        <Palette size={24} strokeWidth={2.2} />
        <h2>{copy.settings.theme}</h2>
      </header>
      <div className="theme-preset-grid">
        {THEME_PRESETS.map((tone) => (
          <button
            key={tone.key}
            className={themeTone === tone.key ? 'is-selected' : ''}
            onClick={() => {
              onThemeTone(tone.key);
              setActiveColor(null);
              setCustomOpen(false);
            }}
            aria-pressed={themeTone === tone.key}
          >
            <span>
              {Object.values(tone.colors).map((color) => (
                <i key={color} style={{ backgroundColor: color }} />
              ))}
            </span>
            <strong>{presetLabels[tone.key]}</strong>
          </button>
        ))}
      </div>
      <div className="theme-color-controls">
        {controls.map((control) => (
          <div key={control.key} className="theme-color-control">
            <button
              onClick={() => {
                setActiveColor((current) =>
                  current === control.key ? null : control.key,
                );
                setCustomOpen(false);
              }}
              aria-expanded={activeColor === control.key}
            >
              <span>{control.label}</span>
              <span>
                <small>
                  {themePalette[control.key]
                    .replace('#', '')
                    .toUpperCase()}
                </small>
                <i
                  style={{
                    backgroundColor: themePalette[control.key],
                  }}
                />
              </span>
            </button>
            <AnimatePresence>
              {activeColor === control.key ? (
                <motion.div
                  className="theme-color-popover"
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                >
                  <div className="theme-color-swatches">
                    {STAR_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => onThemeColor(control.key, color)}
                        style={{ backgroundColor: color }}
                        aria-label={copy.settings.useColor(color)}
                      />
                    ))}
                    <button
                      className="theme-custom-swatch"
                      onClick={() =>
                        setCustomOpen((current) => !current)
                      }
                      aria-label={copy.settings.customColor}
                    />
                  </div>
                  {customOpen ? (
                    <div className="theme-custom-picker">
                      <HexColorPicker
                        color={themePalette[control.key]}
                        onChange={(color) =>
                          onThemeColor(control.key, color)
                        }
                      />
                      <div className="theme-custom-color-input">
                        <span aria-hidden="true">#</span>
                        <HexColorInput
                          color={themePalette[control.key]}
                          aria-label={copy.settings.customColor}
                          onChange={(color) =>
                            onThemeColor(control.key, color)
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  );
}
