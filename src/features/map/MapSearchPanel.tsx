import { ChevronRight, Search, X } from 'lucide-react';
import { motion } from 'motion/react';
import { EmotionStar } from '../../EmotionStar';
import { useAppLanguage } from '../../i18n';
import type { EmotionMoment, EmotionNote } from '../../types';
import { useDialogFocus } from '../../app/useDialogFocus';

export function MapSearchPanel({
  activeField,
  coordinateSearch,
  textSearch,
  results,
  notes,
  onActiveField,
  onCoordinateSearch,
  onTextSearch,
  onSubmit,
  onFocusResult,
  onClose,
}: {
  activeField: 'coordinate' | 'text';
  coordinateSearch: string;
  textSearch: string;
  results: EmotionMoment[];
  notes: EmotionNote[];
  onActiveField: (value: 'coordinate' | 'text') => void;
  onCoordinateSearch: (value: string) => void;
  onTextSearch: (value: string) => void;
  onSubmit: () => void;
  onFocusResult: (moment: EmotionMoment) => void;
  onClose: () => void;
}) {
  const { copy } = useAppLanguage();
  const dialogRef = useDialogFocus<HTMLFormElement>({
    onEscape: onClose,
  });

  return (
    <motion.div
      className="map-search-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={onClose}
    >
      <motion.form
        ref={dialogRef}
        className="map-search-form"
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        onPointerDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        role="dialog"
        aria-modal="true"
        aria-label={copy.map.search}
        tabIndex={-1}
      >
        <div className="map-search-fields">
          <input
            value={coordinateSearch}
            onFocus={() => onActiveField('coordinate')}
            onChange={(event) =>
              onCoordinateSearch(event.target.value)
            }
            placeholder="(35.8626, 129.1945)"
            className={activeField === 'coordinate' ? 'is-active' : ''}
            aria-label={copy.map.coordinateInput}
          />
          <label className={activeField === 'text' ? 'is-active' : ''}>
            <input
              value={textSearch}
              onFocus={() => onActiveField('text')}
              onChange={(event) => onTextSearch(event.target.value)}
              placeholder={copy.map.searchPlaceholder}
              aria-label={copy.map.searchPlaceholder}
            />
          </label>
          <button
            type="submit"
            className="map-search-submit"
            style={{ top: activeField === 'coordinate' ? 6 : 62 }}
            aria-label={copy.map.searchSubmit}
            disabled={
              activeField === 'coordinate'
                ? !coordinateSearch.trim()
                : !textSearch.trim()
            }
          >
            <Search size={28} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="map-search-close popup-close-button"
            onClick={onClose}
            aria-label={copy.common.close}
          >
            <X size={19} strokeWidth={2.2} />
          </button>
        </div>
        {activeField === 'text' && textSearch.trim() ? (
          <div className="map-search-results" aria-live="polite">
            {results.length ? (
              results.map((moment) => {
                const note = notes.find(
                  (item) => item.id === moment.noteId,
                );
                return (
                  <button
                    type="button"
                    key={moment.id}
                    onClick={() => onFocusResult(moment)}
                  >
                    <EmotionStar
                      emotion={moment.emotion}
                      size={28}
                      colorOverride={moment.color}
                    />
                    <span>
                      <strong>{note?.title || moment.place}</strong>
                      <small>
                        {moment.date} · {moment.time} · {moment.place}
                      </small>
                    </span>
                    <ChevronRight size={18} strokeWidth={2.2} />
                  </button>
                );
              })
            ) : (
              <p>{copy.map.noSearchResults}</p>
            )}
          </div>
        ) : null}
      </motion.form>
    </motion.div>
  );
}
