import { useEffect, useState } from 'react';
import type { StoredNoteImage } from '../../types';
import type { CloudAuth } from '../../services/supabaseClient';
import {
  createNoteImageSignedUrl,
  NOTE_IMAGE_URL_REFRESH_MS,
} from '../../services/noteImageStorage';

export function StoredNoteImageView({
  image,
  auth,
  alt,
  srcOverride,
  className,
}: {
  image: StoredNoteImage;
  auth: CloudAuth | null;
  alt: string;
  srcOverride?: string | null;
  className?: string;
}) {
  const [src, setSrc] = useState(srcOverride ?? '');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let refreshTimer: number | null = null;
    setFailed(false);
    if (srcOverride) {
      setSrc(srcOverride);
      return () => { active = false; };
    }
    setSrc('');
    if (!auth) return () => { active = false; };
    const refresh = () => {
      void createNoteImageSignedUrl(image, auth)
        .then((signedUrl) => {
          if (!active) return;
          setSrc(signedUrl);
          setFailed(false);
          refreshTimer = window.setTimeout(refresh, NOTE_IMAGE_URL_REFRESH_MS);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    };
    refresh();
    return () => {
      active = false;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    };
  }, [auth, image, srcOverride]);

  return (
    <div
      className={`${className ?? ''} stored-note-image-view ${failed ? 'is-failed' : ''}`}
      style={{ aspectRatio: `${image.width} / ${image.height}` }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="stored-note-image-placeholder" role="img" aria-label={alt} />
      )}
    </div>
  );
}
