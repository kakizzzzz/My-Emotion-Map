import type { AppLanguage } from '../../i18n';
import type { PhotoAssistResult } from '../../app/appTypes';
import type { CloudAuth } from '../../services/supabaseClient';

const MAX_DIMENSION = 672;
const MAX_BYTES = 700 * 1024;

const canvasBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

const blobToDataUrl = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
};

export const preparePhotoForAssist = async (file: File) => {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('image_processing_unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    let blob: Blob | null = null;
    for (const quality of [0.82, 0.68, 0.52]) {
      blob = await canvasBlob(canvas, quality);
      if (blob && blob.size <= MAX_BYTES) break;
    }
    if (!blob || blob.size > MAX_BYTES) throw new Error('image_too_large');
    return { imageDataUrl: await blobToDataUrl(blob), width, height, bytes: blob.size };
  } finally {
    bitmap.close();
  }
};

const validateResult = (value: unknown): PhotoAssistResult | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const title = source.titleSuggestion;
  if (title !== null && typeof title !== 'string') return null;
  if (!Array.isArray(source.optionalQuestions) || source.optionalQuestions.length > 2) return null;
  const optionalQuestions = source.optionalQuestions
    .map((item) => typeof item === 'string' ? item.trim() : '')
    .filter(Boolean);
  if (optionalQuestions.length !== source.optionalQuestions.length) return null;
  return {
    titleSuggestion: typeof title === 'string' ? title.trim().slice(0, 80) || null : null,
    optionalQuestions: optionalQuestions.map((item) => item.slice(0, 180)),
  };
};

export const invokePhotoAssist = async ({
  auth,
  imageDataUrl,
  language,
  localDate,
}: {
  auth: CloudAuth;
  imageDataUrl: string;
  language: AppLanguage;
  localDate?: string;
}) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 17_000);
  try {
    const response = await fetch(`${auth.supabaseUrl}/functions/v1/photo-assist`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${auth.accessToken}`,
        apikey: auth.publishableKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ imageDataUrl, language, localDate }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as { status?: unknown; result?: unknown } | null;
    if (!response.ok || payload?.status !== 'ready') return null;
    return validateResult(payload.result);
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
};
