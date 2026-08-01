import { parse } from 'exifr';

export type PhotoMetadata = {
  latitude: number;
  longitude: number;
  photoTakenAt?: string;
  photoTakenAtKind?: 'local' | 'offset';
  photoTakenAtSource?: 'DateTimeOriginal' | 'CreateDate';
  date?: string;
  time?: string;
};

const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;
const OFFSET = /^[+-](?:0\d|1[0-4]):[0-5]\d$/;

export const parseExifWallTime = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const match = EXIF_DATE.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const [y, mo, d, h, mi, s] = parts;
  const probe = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d || probe.getUTCHours() !== h || probe.getUTCMinutes() !== mi || probe.getUTCSeconds() !== s) return null;
  return { localIso: `${year}-${month}-${day}T${hour}:${minute}:${second}`, date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
};

export const readPhotoMetadata = async (file: File): Promise<PhotoMetadata | null> => {
  const tags = await parse(file, {
    gps: true,
    exif: true,
    ifd0: {},
    translateValues: false,
    reviveValues: false,
    pick: ['latitude', 'longitude', 'DateTimeOriginal', 'CreateDate', 'OffsetTimeOriginal', 'OffsetTimeDigitized'],
  });
  const latitude = Number(tags?.latitude);
  const longitude = Number(tags?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  const source = typeof tags?.DateTimeOriginal === 'string' ? 'DateTimeOriginal' : typeof tags?.CreateDate === 'string' ? 'CreateDate' : undefined;
  const wall = source ? parseExifWallTime(tags[source]) : null;
  if (!source || !wall) return { latitude, longitude };
  const candidateOffset = tags?.OffsetTimeOriginal ?? tags?.OffsetTimeDigitized;
  const offset = typeof candidateOffset === 'string' && OFFSET.test(candidateOffset) ? candidateOffset : undefined;
  return {
    latitude, longitude, date: wall.date, time: wall.time,
    photoTakenAt: `${wall.localIso}${offset ?? ''}`,
    photoTakenAtKind: offset ? 'offset' : 'local',
    photoTakenAtSource: source,
  };
};
