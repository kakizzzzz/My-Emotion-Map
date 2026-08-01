import type { RefObject } from 'react';
import {
  Copy,
  Edit2,
  Eye,
  ExternalLink,
  Palette,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import { EMOTIONS } from '../../data';
import { MOTION } from '../../motion';
import { useAppLanguage } from '../../i18n';
import type { EmotionMoment } from '../../types';
import { STAR_COLORS } from '../../domain/notePrompts';
import type { MapProvider } from './coordinateTransforms';

export function StarActionBar({
  overlayRef,
  moment,
  activeTab,
  customPickerOpen,
  customColor,
  mapChooserOpen,
  copyStatus,
  onActiveTab,
  onCustomPickerOpen,
  onCustomColor,
  onMapChooserOpen,
  onColor,
  onEdit,
  onView,
  onDelete,
  onCopyCoordinates,
  onOpenMap,
}: {
  overlayRef: RefObject<HTMLDivElement | null>;
  moment: EmotionMoment;
  activeTab: 'eye' | 'color' | null;
  customPickerOpen: boolean;
  customColor: string;
  mapChooserOpen: boolean;
  copyStatus: string;
  onActiveTab: (tab: 'eye' | 'color' | null) => void;
  onCustomPickerOpen: (open: boolean) => void;
  onCustomColor: (color: string) => void;
  onMapChooserOpen: (open: boolean) => void;
  onColor: (color: string) => void;
  onEdit: () => void;
  onView: () => void;
  onDelete: () => void;
  onCopyCoordinates: () => void;
  onOpenMap: (provider: MapProvider) => void;
}) {
  const { copy } = useAppLanguage();
  const selectedColor =
    moment.color ?? (moment.emotion ? EMOTIONS[moment.emotion].color : '#5C5C5C');

  return (
    <motion.div
      ref={overlayRef}
      className="star-action-overlay star-action-overlay--map"
      initial={{ opacity: 0, y: -7, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -5, scale: 0.96 }}
      transition={MOTION.tools}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="star-action-pill">
        <button
          className={activeTab === 'eye' ? 'is-active' : ''}
          onClick={() => onActiveTab(activeTab === 'eye' ? null : 'eye')}
          aria-label={copy.map.starDetails}
          aria-pressed={activeTab === 'eye'}
        >
          <Eye size={18} strokeWidth={2.2} />
        </button>
        <button
          className={activeTab === 'color' ? 'is-active' : ''}
          onClick={() => {
            const next = activeTab === 'color' ? null : 'color';
            onActiveTab(next);
            if (next === 'color') onCustomColor(selectedColor);
            else onCustomPickerOpen(false);
          }}
          aria-label={copy.map.chooseColor}
          aria-pressed={activeTab === 'color'}
        >
          <Palette size={18} strokeWidth={2.2} />
        </button>
        <button
          onClick={moment.isNew ? onEdit : onView}
          aria-label={
            moment.isNew
              ? copy.map.recordStar
              : copy.map.viewStarRecord
          }
        >
          <Edit2 size={18} strokeWidth={2.2} />
        </button>
        <button onClick={onDelete} aria-label={copy.map.deleteStar}>
          <Trash2 size={18} strokeWidth={2.2} />
        </button>
      </div>

      {activeTab === 'eye' ? (
        <div className="star-detail-pill">
          <strong>
            ({Math.abs(moment.latitude).toFixed(4)}°{' '}
            {moment.latitude >= 0 ? 'N' : 'S'},{' '}
            {Math.abs(moment.longitude).toFixed(4)}°{' '}
            {moment.longitude >= 0 ? 'E' : 'W'})
          </strong>
          <i />
          <button
            onClick={onCopyCoordinates}
            aria-label={copy.map.copyCoordinates}
          >
            <Copy size={14} strokeWidth={2.2} />
          </button>
          <button
            onClick={() => onMapChooserOpen(!mapChooserOpen)}
            aria-label={copy.map.openExternalMap}
            aria-expanded={mapChooserOpen}
          >
            <ExternalLink size={14} strokeWidth={2.2} />
          </button>
        </div>
      ) : null}

      {activeTab === 'eye' && mapChooserOpen ? (
        <div className="map-provider-grid">
          {(
            [
              ['apple', 'Apple'],
              ['amap', 'AMap'],
              ['baidu', 'Baidu'],
              ['google', 'Google'],
            ] as Array<[MapProvider, string]>
          ).map(([provider, label]) => (
            <button
              key={provider}
              onClick={() => onOpenMap(provider)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {activeTab === 'eye' && copyStatus ? (
        <div className="star-copy-status" role="status">
          {copyStatus}
        </div>
      ) : null}

      {activeTab === 'color' ? (
        <div className="star-color-controls">
          <div className="star-color-panel">
            {STAR_COLORS.map((color) => (
              <button
                key={color}
                className={
                  selectedColor.toLowerCase() === color.toLowerCase()
                    ? 'is-selected'
                    : ''
                }
                style={{ background: color }}
                onClick={() => {
                  onCustomPickerOpen(false);
                  onCustomColor(color);
                  onColor(color);
                }}
                aria-label={copy.map.useColor(color)}
                aria-pressed={
                  selectedColor.toLowerCase() === color.toLowerCase()
                }
              />
            ))}
            <button
              className={`custom-color-button ${
                customPickerOpen ? 'is-selected' : ''
              }`}
              onClick={() =>
                onCustomPickerOpen(!customPickerOpen)
              }
              aria-label={copy.map.customColor}
              aria-expanded={customPickerOpen}
            >
              <i />
            </button>
          </div>
          {customPickerOpen ? (
            <div className="custom-color-picker">
              <HexColorPicker
                color={customColor}
                onChange={(color) => {
                  onCustomColor(color);
                  onColor(color);
                }}
              />
              <div className="custom-color-input">
                <span aria-hidden="true">#</span>
                <HexColorInput
                  color={customColor}
                  aria-label={copy.map.customColor}
                  onChange={(color) => {
                    onCustomColor(color);
                    onColor(color);
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </motion.div>
  );
}
