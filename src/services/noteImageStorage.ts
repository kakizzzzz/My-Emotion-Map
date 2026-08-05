import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { StoredNoteImage } from '../types';
import type { CloudAuth } from './supabaseClient';

export const NOTE_IMAGE_BUCKET = 'emotion-note-images';

const MAX_IMAGE_DIMENSION = 1_600;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const SIGNED_URL_SECONDS = 60 * 60;
export const NOTE_IMAGE_URL_REFRESH_MS = 55 * 60 * 1_000;
const SAFE_PART = /[^a-zA-Z0-9_-]/g;
const PENDING_DELETE_KEY = 'my-emotion-map-pending-note-images-v1';
const REPLACED_IMAGE_GRACE_MS = 7 * 24 * 60 * 60 * 1_000;

type PendingDelete = StoredNoteImage & { deleteAfter: number };

const scopedClient = (auth: CloudAuth): SupabaseClient => createClient(
  auth.supabaseUrl,
  auth.publishableKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    },
  },
);

const safePart = (value: string, fallback: string) =>
  value.replace(SAFE_PART, '-').replace(/^-+|-+$/g, '').slice(0, 160) || fallback;

const sameImage = (
  left: Pick<StoredNoteImage, 'bucket' | 'path'> | null | undefined,
  right: Pick<StoredNoteImage, 'bucket' | 'path'> | null | undefined,
) => Boolean(left && right && left.bucket === right.bucket && left.path === right.path);

export const isSameStoredNoteImage = sameImage;

export const isStoredNoteImage = (value: unknown): value is StoredNoteImage => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const image = value as Record<string, unknown>;
  return image.provider === 'supabase' &&
    image.bucket === NOTE_IMAGE_BUCKET &&
    typeof image.path === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/notes\/[a-zA-Z0-9_-]{1,160}\/[a-zA-Z0-9_-]{1,160}\.jpg$/i
      .test(image.path) &&
    image.mimeType === 'image/jpeg' &&
    Number.isSafeInteger(image.size) && Number(image.size) > 0 &&
    Number(image.size) <= MAX_IMAGE_BYTES &&
    Number.isSafeInteger(image.width) && Number(image.width) > 0 &&
    Number(image.width) <= MAX_IMAGE_DIMENSION &&
    Number.isSafeInteger(image.height) && Number(image.height) > 0 &&
    Number(image.height) <= MAX_IMAGE_DIMENSION &&
    Number.isSafeInteger(image.createdAt) && Number(image.createdAt) > 0;
};

const canvasBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

type DrawableImage = {
  width: number;
  height: number;
  draw: CanvasImageSource;
  dispose: () => void;
};

const loadDrawableImage = async (file: File): Promise<DrawableImage> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: bitmap,
        dispose: () => bitmap.close(),
      };
    } catch {
      // Safari can decode some camera formats through an image element even
      // when createImageBitmap cannot.
    }
  }
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('image_decode_failed'));
      image.src = objectUrl;
    });
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw: image,
      dispose: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
};

export const prepareNoteImage = async (file: File) => {
  const looksLikeImage = file.type.startsWith('image/') ||
    /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name);
  if (!looksLikeImage) throw new Error('unsupported_image');
  const source = await loadDrawableImage(file);
  try {
    let scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(source.width, source.height),
    );
    let quality = 0.88;
    let result: Blob | null = null;
    let width = 0;
    let height = 0;
    for (let attempt = 0; attempt < 9; attempt += 1) {
      width = Math.max(1, Math.round(source.width * scale));
      height = Math.max(1, Math.round(source.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('image_processing_unavailable');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(source.draw, 0, 0, width, height);
      result = await canvasBlob(canvas, quality);
      if (result && result.size <= MAX_IMAGE_BYTES) break;
      if (quality > 0.58) quality -= 0.1;
      else scale *= 0.82;
    }
    if (!result || result.size > MAX_IMAGE_BYTES) throw new Error('image_too_large');
    return { blob: result, width, height };
  } finally {
    source.dispose();
  }
};

export const createNoteImageSignedUrl = async (
  image: StoredNoteImage,
  auth: CloudAuth,
) => {
  if (!isStoredNoteImage(image) || !image.path.startsWith(`${auth.userId}/`)) {
    throw new Error('invalid_note_image');
  }
  const { data, error } = await scopedClient(auth).storage
    .from(image.bucket)
    .createSignedUrl(image.path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw error ?? new Error('signed_url_failed');
  return data.signedUrl;
};

export const uploadNoteImage = async ({
  file,
  noteId,
  auth,
}: {
  file: File;
  noteId: string;
  auth: CloudAuth;
}) => {
  const prepared = await prepareNoteImage(file);
  const imageId = safePart(crypto.randomUUID(), `image-${Date.now()}`);
  const safeNoteId = safePart(noteId, 'note');
  const path = `${auth.userId}/notes/${safeNoteId}/${imageId}.jpg`;
  const client = scopedClient(auth);
  const { error } = await client.storage.from(NOTE_IMAGE_BUCKET).upload(
    path,
    prepared.blob,
    {
      cacheControl: '3600',
      contentType: 'image/jpeg',
      upsert: false,
    },
  );
  if (error) throw error;
  const metadata: StoredNoteImage = {
    provider: 'supabase',
    bucket: NOTE_IMAGE_BUCKET,
    path,
    mimeType: 'image/jpeg',
    size: prepared.blob.size,
    width: prepared.width,
    height: prepared.height,
    createdAt: Date.now(),
  };
  let src: string;
  try {
    src = await createNoteImageSignedUrl(metadata, auth);
  } catch {
    // The object URL still provides an immediate editor preview. Metadata is
    // retained so a later signed-URL request can recover the cloud image.
    src = URL.createObjectURL(prepared.blob);
  }
  return { metadata, src };
};

const pendingKey = (userId: string) => `${PENDING_DELETE_KEY}:${userId}`;

const readPending = (userId: string): PendingDelete[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(pendingKey(userId)) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is PendingDelete =>
        isStoredNoteImage(item) && Number.isFinite(
          (item as StoredNoteImage & { deleteAfter?: unknown }).deleteAfter,
        ))
      : [];
  } catch {
    return [];
  }
};

const writePending = (userId: string, values: PendingDelete[]) => {
  if (typeof window === 'undefined') return;
  const unique = values.filter((item, index, list) =>
    list.findIndex((candidate) => sameImage(candidate, item)) === index);
  try {
    if (unique.length) {
      window.localStorage.setItem(pendingKey(userId), JSON.stringify(unique));
    } else {
      window.localStorage.removeItem(pendingKey(userId));
    }
  } catch {
    // The cloud object remains private even if local retry state is unavailable.
  }
};

const removeImageObject = async (image: StoredNoteImage, auth: CloudAuth) => {
  if (!image.path.startsWith(`${auth.userId}/`)) return false;
  try {
    const { error } = await scopedClient(auth).storage
      .from(image.bucket)
      .remove([image.path]);
    return !error;
  } catch {
    return false;
  }
};

export const deleteUploadedNoteImage = async (
  image: StoredNoteImage,
  auth: CloudAuth,
) => {
  const queued: PendingDelete = { ...image, deleteAfter: Date.now() };
  writePending(auth.userId, [...readPending(auth.userId), queued]);
  const deleted = await removeImageObject(image, auth);
  if (deleted) {
    writePending(
      auth.userId,
      readPending(auth.userId).filter((item) => !sameImage(item, image)),
    );
  }
  return deleted;
};

export const scheduleReplacedNoteImageDeletion = (
  image: StoredNoteImage,
  auth: CloudAuth,
) => {
  if (!image.path.startsWith(`${auth.userId}/`)) return;
  writePending(auth.userId, [
    ...readPending(auth.userId),
    { ...image, deleteAfter: Date.now() + REPLACED_IMAGE_GRACE_MS },
  ]);
};

export const retryPendingNoteImageDeletions = async (
  auth: CloudAuth,
  referencedImages: StoredNoteImage[],
) => {
  const referenced = new Set(referencedImages.map((item) => `${item.bucket}/${item.path}`));
  const pending = readPending(auth.userId);
  const retained: PendingDelete[] = [];
  for (const item of pending) {
    const key = `${item.bucket}/${item.path}`;
    if (referenced.has(key) || item.deleteAfter > Date.now()) {
      retained.push(item);
      continue;
    }
    if (!await removeImageObject(item, auth)) retained.push(item);
  }
  writePending(auth.userId, retained);
};
