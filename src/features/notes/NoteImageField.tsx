import { useEffect, useRef, useState } from 'react';
import { ImagePlus, LoaderCircle, X } from 'lucide-react';
import type { AppCopy } from '../../i18n';
import type { ToastHandler } from '../../app/appTypes';
import type { EmotionNote, StoredNoteImage } from '../../types';
import type { CloudAuth } from '../../services/supabaseClient';
import {
  deleteUploadedNoteImage,
  isSameStoredNoteImage,
  scheduleReplacedNoteImageDeletion,
  uploadNoteImage,
} from '../../services/noteImageStorage';
import { StoredNoteImageView } from './StoredNoteImageView';

export const useNoteImageEditor = ({
  note,
  cloudAuth,
  copy,
  onToast,
}: {
  note: EmotionNote;
  cloudAuth: CloudAuth | null;
  copy: AppCopy;
  onToast: ToastHandler;
}) => {
  const [image, setImage] = useState<StoredNoteImage | null>(note.image ?? null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const originalRef = useRef<StoredNoteImage | null>(note.image ?? null);
  const uploadedRef = useRef<StoredNoteImage | null>(null);
  const committedRef = useRef(false);
  const cloudAuthRef = useRef(cloudAuth);
  const activeRef = useRef(true);

  useEffect(() => {
    cloudAuthRef.current = cloudAuth;
  }, [cloudAuth]);

  useEffect(() => () => {
    if (previewSrc?.startsWith('blob:')) URL.revokeObjectURL(previewSrc);
  }, [previewSrc]);

  useEffect(() => () => {
    activeRef.current = false;
    const uploaded = uploadedRef.current;
    const currentAuth = cloudAuthRef.current;
    if (!committedRef.current && uploaded && currentAuth) {
      void deleteUploadedNoteImage(uploaded, currentAuth);
    }
  }, []);

  const selectImage = async (file: File) => {
    if (uploading) return;
    if (!cloudAuth) {
      onToast(copy.feedback.noteImageRequiresCloud);
      return;
    }
    setUploading(true);
    try {
      const previousUpload = uploadedRef.current;
      const uploaded = await uploadNoteImage({ file, noteId: note.id, auth: cloudAuth });
      if (!activeRef.current || cloudAuthRef.current?.userId !== cloudAuth.userId) {
        if (uploaded.src.startsWith('blob:')) URL.revokeObjectURL(uploaded.src);
        await deleteUploadedNoteImage(uploaded.metadata, cloudAuth);
        return;
      }
      uploadedRef.current = uploaded.metadata;
      setImage(uploaded.metadata);
      setPreviewSrc(uploaded.src);
      if (previousUpload && !isSameStoredNoteImage(previousUpload, uploaded.metadata)) {
        void deleteUploadedNoteImage(previousUpload, cloudAuth);
      }
    } catch {
      if (activeRef.current) onToast(copy.feedback.noteImageUploadFailed);
    } finally {
      if (activeRef.current) setUploading(false);
    }
  };

  const removeImage = () => {
    if (uploading || !image) return;
    const uploaded = uploadedRef.current;
    if (uploaded && isSameStoredNoteImage(uploaded, image) && cloudAuth) {
      uploadedRef.current = null;
      void deleteUploadedNoteImage(uploaded, cloudAuth);
    }
    setImage(null);
    setPreviewSrc(null);
  };

  const commitImage = (savedImage: StoredNoteImage | null | undefined) => {
    committedRef.current = true;
    uploadedRef.current = null;
    const original = originalRef.current;
    if (original && cloudAuth && !isSameStoredNoteImage(original, savedImage)) {
      scheduleReplacedNoteImageDeletion(original, cloudAuth);
    }
  };

  return {
    image,
    previewSrc,
    uploading,
    selectImage,
    removeImage,
    commitImage,
  };
};

export function NoteImageField({
  image,
  previewSrc,
  uploading,
  cloudAuth,
  copy,
  onSelect,
  onRemove,
}: {
  image: StoredNoteImage | null;
  previewSrc: string | null;
  uploading: boolean;
  cloudAuth: CloudAuth | null;
  copy: AppCopy;
  onSelect: (file: File) => void | Promise<void>;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className={`note-image-field ${image ? 'has-image' : ''}`}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void onSelect(file);
        }}
      />
      {image ? (
        <>
          <button
            type="button"
            className="note-image-replace"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            aria-label={copy.note.replacePhoto}
          >
            <StoredNoteImageView
              image={image}
              auth={cloudAuth}
              alt={copy.note.photoPreview}
              srcOverride={previewSrc}
            />
            <span>{copy.note.replacePhoto}</span>
          </button>
          <button
            type="button"
            className="note-image-remove"
            onClick={onRemove}
            disabled={uploading}
            aria-label={copy.note.removePhoto}
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </>
      ) : (
        <button
          type="button"
          className="note-image-add"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <LoaderCircle size={19} className="note-image-spinner" />
          ) : (
            <ImagePlus size={19} strokeWidth={2.1} />
          )}
          <span>{uploading ? copy.note.photoUploading : copy.note.addPhoto}</span>
        </button>
      )}
    </div>
  );
}
