import { beforeEach, describe, expect, it, vi } from 'vitest';

const exifr = vi.hoisted(() => ({
  gps: vi.fn(),
  parse: vi.fn(),
}));

vi.mock('exifr', () => exifr);

import { readPhotoMetadata } from '../../src/features/map/photoMetadata';

const createGpsJpeg = () => {
  const tiffLength = 128;
  const exifPayloadLength = 6 + tiffLength;
  const bytes = new Uint8Array(2 + 2 + 2 + exifPayloadLength + 2);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0xffd8, false);
  view.setUint16(2, 0xffe1, false);
  view.setUint16(4, exifPayloadLength + 2, false);
  bytes.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6);

  const tiff = 12;
  view.setUint16(tiff, 0x4949, false);
  view.setUint16(tiff + 2, 42, true);
  view.setUint32(tiff + 4, 8, true);

  const ifd0 = tiff + 8;
  view.setUint16(ifd0, 1, true);
  view.setUint16(ifd0 + 2, 0x8825, true);
  view.setUint16(ifd0 + 4, 4, true);
  view.setUint32(ifd0 + 6, 1, true);
  view.setUint32(ifd0 + 10, 26, true);
  view.setUint32(ifd0 + 14, 0, true);

  const gpsIfd = tiff + 26;
  view.setUint16(gpsIfd, 4, true);
  const writeEntry = (
    index: number,
    tag: number,
    type: number,
    count: number,
    value: number,
  ) => {
    const entry = gpsIfd + 2 + index * 12;
    view.setUint16(entry, tag, true);
    view.setUint16(entry + 2, type, true);
    view.setUint32(entry + 4, count, true);
    view.setUint32(entry + 8, value, true);
    return entry;
  };
  const latRef = writeEntry(0, 0x0001, 2, 2, 0);
  bytes[latRef + 8] = 'N'.charCodeAt(0);
  writeEntry(1, 0x0002, 5, 3, 80);
  const lngRef = writeEntry(2, 0x0003, 2, 2, 0);
  bytes[lngRef + 8] = 'E'.charCodeAt(0);
  writeEntry(3, 0x0004, 5, 3, 104);
  view.setUint32(gpsIfd + 50, 0, true);

  const writeRationals = (
    offset: number,
    values: Array<[number, number]>,
  ) => values.forEach(([numerator, denominator], index) => {
    view.setUint32(tiff + offset + index * 8, numerator, true);
    view.setUint32(tiff + offset + index * 8 + 4, denominator, true);
  });
  writeRationals(80, [[37, 1], [33, 1], [288, 10]]);
  writeRationals(104, [[126, 1], [59, 1], [528, 10]]);
  view.setUint16(bytes.length - 2, 0xffd9, false);
  return new File([bytes], 'gps-photo.jpg', { type: 'image/jpeg' });
};

describe('photo metadata', () => {
  beforeEach(() => {
    exifr.gps.mockReset().mockResolvedValue(undefined);
    exifr.parse.mockReset().mockResolvedValue(undefined);
  });

  it('falls back to the My Life Memory JPEG EXIF parser when exifr GPS is empty', async () => {
    await expect(readPhotoMetadata(createGpsJpeg())).resolves.toMatchObject({
      latitude: 37.558,
      longitude: 126.998,
    });
  });
});
