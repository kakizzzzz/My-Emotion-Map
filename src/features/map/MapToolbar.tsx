import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ChevronDown,
  ChevronRight,
  MapPin,
  Menu,
  Minus,
  Plus,
  Search,
  Star,
  Tag,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { MapStyleThumbnail } from '../../MapStyleThumbnail';
import { MOTION } from '../../motion';
import { useAppLanguage } from '../../i18n';
import type { LocationRequestState } from '../../useLocationController';
import {
  MAP_STYLE_ORDER,
  MAP_STYLES,
} from './mapPreferences';
import type { CoordinatePair } from './coordinateTransforms';
import { PhotoLocationImportButton } from './PhotoLocationImportButton';

export function MapToolbar({
  toolsOpen,
  mapStyle,
  mapStyleLabels,
  stylePickerOpen,
  tagMode,
  starDragPreview,
  photoLoading,
  searchOpen,
  locationRequestState,
  onToolsOpen,
  onStylePickerOpen,
  onMapStyle,
  onRequestLocation,
  onTagMode,
  onBeginStarDrag,
  onBeginStarMouseDrag,
  onStarClick,
  onPhotoFile,
  onSearchOpen,
}: {
  toolsOpen: boolean;
  mapStyle: keyof typeof MAP_STYLES;
  mapStyleLabels: Record<keyof typeof MAP_STYLES, string>;
  stylePickerOpen: boolean;
  tagMode: 'add' | 'remove' | null;
  starDragPreview: CoordinatePair | null;
  photoLoading: boolean;
  searchOpen: boolean;
  locationRequestState: LocationRequestState;
  onToolsOpen: () => void;
  onStylePickerOpen: () => void;
  onMapStyle: (style: keyof typeof MAP_STYLES) => void;
  onRequestLocation: (intent: 'center' | 'place') => void;
  onTagMode: (mode: 'add' | 'remove' | null) => void;
  onBeginStarDrag: (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onBeginStarMouseDrag: (
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
  onStarClick: () => void;
  onPhotoFile: (file: File) => void;
  onSearchOpen: () => void;
}) {
  const { copy } = useAppLanguage();

  return (
    <div className="map-toolbar">
      <AnimatePresence>
        {toolsOpen ? (
          <motion.div
            className="map-toolbar__items"
            initial={{ opacity: 0, y: -20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.8 }}
            transition={MOTION.tools}
            style={{ transformOrigin: 'top right' }}
          >
            <div className="style-tool-group">
              <button
                className="map-tool map-style-tool"
                onClick={onStylePickerOpen}
                aria-label={copy.map.switchStyle}
                aria-expanded={stylePickerOpen}
              >
                <span className="map-style-thumb">
                  <MapStyleThumbnail styleName={mapStyle} />
                </span>
              </button>
              <AnimatePresence>
                {stylePickerOpen ? (
                  <motion.div
                    className="map-style-picker"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                  >
                    {MAP_STYLE_ORDER.map((style) => (
                      <button
                        key={style}
                        className={
                          mapStyle === style ? 'is-selected' : ''
                        }
                        onClick={() => onMapStyle(style)}
                        aria-label={mapStyleLabels[style]}
                        aria-pressed={mapStyle === style}
                      >
                        <span className="map-style-thumb">
                          <MapStyleThumbnail styleName={style} />
                        </span>
                      </button>
                    ))}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
            <button
              className={`map-tool ${
                locationRequestState === 'ready' ? 'is-active' : ''
              }`}
              onClick={() => onRequestLocation('center')}
              aria-label={copy.map.returnToCurrentLocation}
              aria-busy={locationRequestState === 'requesting'}
              disabled={locationRequestState === 'requesting'}
            >
              <MapPin size={24} strokeWidth={2.2} />
            </button>
            <div className="tag-tool-group">
              <button
                className={`map-tool ${tagMode ? 'is-active' : ''}`}
                onClick={() =>
                  onTagMode(tagMode ? null : 'add')
                }
                aria-label={copy.map.connectStars}
                aria-pressed={Boolean(tagMode)}
                aria-expanded={Boolean(tagMode)}
              >
                <Tag size={21} strokeWidth={2.2} />
              </button>
              <AnimatePresence>
                {tagMode ? (
                  <motion.div
                    className="tag-tool-popover"
                    initial={{ opacity: 0, x: 8, scale: 0.92 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 8, scale: 0.92 }}
                    transition={MOTION.tools}
                  >
                    <button
                      className={tagMode === 'add' ? 'is-active' : ''}
                      onClick={() => onTagMode('add')}
                      aria-label={copy.map.addToTagGroup}
                      aria-pressed={tagMode === 'add'}
                    >
                      <Plus size={22} strokeWidth={2.2} />
                    </button>
                    <button
                      className={
                        tagMode === 'remove' ? 'is-active' : ''
                      }
                      onClick={() => onTagMode('remove')}
                      aria-label={copy.map.removeFromTagGroup}
                      aria-pressed={tagMode === 'remove'}
                    >
                      <Minus size={22} strokeWidth={2.2} />
                    </button>
                    <button
                      onClick={() => onTagMode(null)}
                      aria-label={copy.map.collapseTagTools}
                    >
                      <ChevronRight size={26} strokeWidth={2.2} />
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
            <button
              className={`map-tool map-tool--star ${
                starDragPreview ? 'is-active' : ''
              }`}
              onPointerDown={onBeginStarDrag}
              onMouseDown={onBeginStarMouseDrag}
              onClick={onStarClick}
              aria-label={copy.map.addStar}
              aria-busy={locationRequestState === 'requesting'}
              disabled={locationRequestState === 'requesting'}
            >
              <Star size={24} strokeWidth={2.2} />
            </button>
            <PhotoLocationImportButton
              isLoading={photoLoading}
              onFile={onPhotoFile}
            />
            <button
              className={`map-tool ${
                searchOpen ? 'is-active' : ''
              }`}
              onClick={onSearchOpen}
              aria-label={copy.map.search}
              aria-expanded={searchOpen}
            >
              <Search size={24} strokeWidth={2.2} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <button
        className="map-tool map-tool--menu"
        onClick={onToolsOpen}
        aria-label={
          toolsOpen ? copy.map.collapseTools : copy.map.expandTools
        }
      >
        {toolsOpen ? (
          <ChevronDown size={28} strokeWidth={2.2} />
        ) : (
          <Menu size={24} strokeWidth={2.2} />
        )}
      </button>
    </div>
  );
}
