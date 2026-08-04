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

const TIFF_TYPE_SIZES: Record<number, number> = {
  1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8,
};

type TiffEntry = {
  type: number;
  count: number;
  valueOffset: number;
  entryOffset: number;
};

const readExifGpsFromArrayBuffer = (buffer: ArrayBuffer): [number, number] | null => {
  const view = new DataView(buffer);
  if (view.byteLength < 14 || view.getUint16(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) break;
    const segmentLength = view.getUint16(offset + 2, false);
    const segmentStart = offset + 4;
    const segmentEnd = offset + 2 + segmentLength;

    if (
      marker === 0xe1 &&
      segmentStart + 14 < view.byteLength &&
      view.getUint8(segmentStart) === 0x45 &&
      view.getUint8(segmentStart + 1) === 0x78 &&
      view.getUint8(segmentStart + 2) === 0x69 &&
      view.getUint8(segmentStart + 3) === 0x66
    ) {
      const tiffStart = segmentStart + 6;
      const byteOrder = view.getUint16(tiffStart, false);
      const littleEndian = byteOrder === 0x4949;
      if (!littleEndian && byteOrder !== 0x4d4d) return null;
      if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return null;

      const readIfd = (ifdOffset: number) => {
        const entries = new Map<number, TiffEntry>();
        const absoluteOffset = tiffStart + ifdOffset;
        if (absoluteOffset < tiffStart || absoluteOffset + 2 > view.byteLength) return entries;
        const count = view.getUint16(absoluteOffset, littleEndian);
        for (let index = 0; index < count; index += 1) {
          const entryOffset = absoluteOffset + 2 + index * 12;
          if (entryOffset + 12 > view.byteLength) break;
          entries.set(view.getUint16(entryOffset, littleEndian), {
            type: view.getUint16(entryOffset + 2, littleEndian),
            count: view.getUint32(entryOffset + 4, littleEndian),
            valueOffset: view.getUint32(entryOffset + 8, littleEndian),
            entryOffset,
          });
        }
        return entries;
      };
      const entryValueOffset = (entry?: TiffEntry) => {
        if (!entry) return -1;
        return (TIFF_TYPE_SIZES[entry.type] || 1) * entry.count <= 4
          ? entry.entryOffset + 8
          : tiffStart + entry.valueOffset;
      };
      const readAscii = (entry?: TiffEntry) => {
        const valueOffset = entryValueOffset(entry);
        if (!entry || valueOffset < 0 || valueOffset + entry.count > view.byteLength) return '';
        let value = '';
        for (let index = 0; index < entry.count; index += 1) {
          const code = view.getUint8(valueOffset + index);
          if (code === 0) break;
          value += String.fromCharCode(code);
        }
        return value.trim();
      };
      const readRationals = (entry?: TiffEntry) => {
        const valueOffset = entryValueOffset(entry);
        if (!entry || valueOffset < 0 || valueOffset + entry.count * 8 > view.byteLength) return [];
        return Array.from({ length: entry.count }, (_, index) => {
          const numerator = view.getUint32(valueOffset + index * 8, littleEndian);
          const denominator = view.getUint32(valueOffset + index * 8 + 4, littleEndian);
          return denominator ? numerator / denominator : 0;
        });
      };

      const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
      const gpsPointer = readIfd(firstIfdOffset).get(0x8825);
      if (!gpsPointer) return null;
      const gpsIfd = readIfd(gpsPointer.valueOffset);
      const latRef = readAscii(gpsIfd.get(0x0001));
      const latValues = readRationals(gpsIfd.get(0x0002));
      const lngRef = readAscii(gpsIfd.get(0x0003));
      const lngValues = readRationals(gpsIfd.get(0x0004));
      if (latValues.length < 3 || lngValues.length < 3) return null;
      const decimal = (values: number[], ref: string) => {
        const value = values[0] + values[1] / 60 + values[2] / 3600;
        return ['S', 'W'].includes(ref.toUpperCase()) ? -value : value;
      };
      const latitude = decimal(latValues, latRef);
      const longitude = decimal(lngValues, lngRef);
      return Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
        Number.isFinite(longitude) && Math.abs(longitude) <= 180
        ? [latitude, longitude]
        : null;
    }
    if (segmentLength < 2 || segmentEnd <= offset) break;
    offset = segmentEnd;
  }
  return null;
};

const readPhotoGpsCoordinates = async (file: File): Promise<[number, number] | null> => {
  try {
    const exifr = await import('exifr');
    const coordinates = await exifr.gps(file);
    if (
      coordinates && Number.isFinite(coordinates.latitude) &&
      Math.abs(coordinates.latitude) <= 90 &&
      Number.isFinite(coordinates.longitude) && Math.abs(coordinates.longitude) <= 180
    ) {
      return [coordinates.latitude, coordinates.longitude];
    }
  } catch {
    // Use the same lightweight JPEG EXIF fallback as My Life Memory.
  }
  try {
    return readExifGpsFromArrayBuffer(await file.arrayBuffer());
  } catch {
    return null;
  }
};

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
  const coordinates = await readPhotoGpsCoordinates(file);
  if (!coordinates) return null;
  const [latitude, longitude] = coordinates;
  let tags: {
    DateTimeOriginal?: unknown;
    CreateDate?: unknown;
    OffsetTimeOriginal?: unknown;
    OffsetTimeDigitized?: unknown;
  } | undefined;
  try {
    const { parse } = await import('exifr');
    tags = await parse(file, {
      exif: true,
      ifd0: {},
      translateValues: false,
      reviveValues: false,
      pick: ['DateTimeOriginal', 'CreateDate', 'OffsetTimeOriginal', 'OffsetTimeDigitized'],
    }) as typeof tags;
  } catch {
    return { latitude, longitude };
  }
  const source = typeof tags?.DateTimeOriginal === 'string' ? 'DateTimeOriginal' : typeof tags?.CreateDate === 'string' ? 'CreateDate' : undefined;
  const wall = source ? parseExifWallTime(tags?.[source]) : null;
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
