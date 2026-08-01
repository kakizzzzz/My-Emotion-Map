import { useRef } from 'react';
import { PhotoGpsStarIcon } from '../../PhotoGpsStarIcon';
import { useAppLanguage } from '../../i18n';

export function PhotoLocationImportButton({
  isLoading,
  onFile,
}: {
  isLoading: boolean;
  onFile: (file: File) => void;
}) {
  const { copy } = useAppLanguage();
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <button
        className={`map-tool ${
          isLoading ? 'is-active is-loading' : ''
        }`}
        onClick={() => inputRef.current?.click()}
        aria-label={copy.map.photoLocation}
        aria-busy={isLoading}
        disabled={isLoading}
      >
        <PhotoGpsStarIcon size={24} strokeWidth={2.2} />
      </button>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept="image/*,.heic,.heif"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) onFile(file);
        }}
      />
    </>
  );
}
