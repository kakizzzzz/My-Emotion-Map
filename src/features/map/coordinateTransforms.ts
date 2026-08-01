export type MapProvider = 'apple' | 'amap' | 'baidu' | 'google';

export type CoordinatePair = { lat: number; lng: number };

export const parseCoordinateInput = (
  input: string,
): CoordinatePair | null => {
  const matches = input.match(/[-+]?\d+(?:\.\d+)?/g);
  if (!matches || matches.length !== 2) return null;
  let lat = Number(matches[0]);
  let lng = Number(matches[1]);

  if (Math.abs(lat) > 90 && Math.abs(lat) <= 180 && Math.abs(lng) <= 90) {
    [lat, lng] = [lng, lat];
  }
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }
  return { lat, lng };
};

export const writeClipboardText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

export const isInsideMainlandChina = ({ lat, lng }: CoordinatePair) =>
  lng >= 72.004 && lng <= 137.8347 && lat >= 0.8293 && lat <= 55.8271;

const transformChinaLat = (x: number, y: number) => {
  let result =
    -100 +
    2 * x +
    3 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  result +=
    ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) /
    3;
  result +=
    ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) /
    3;
  result +=
    ((160 * Math.sin((y / 12) * Math.PI) +
      320 * Math.sin((y * Math.PI) / 30)) *
      2) /
    3;
  return result;
};

const transformChinaLng = (x: number, y: number) => {
  let result =
    300 +
    x +
    2 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x));
  result +=
    ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) /
    3;
  result +=
    ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) /
    3;
  result +=
    ((150 * Math.sin((x / 12) * Math.PI) +
      300 * Math.sin((x / 30) * Math.PI)) *
      2) /
    3;
  return result;
};

export const wgs84ToGcj02 = (point: CoordinatePair): CoordinatePair => {
  if (!isInsideMainlandChina(point)) return point;
  const a = 6378245;
  const ee = 0.006693421622965943;
  const dLat = transformChinaLat(point.lng - 105, point.lat - 35);
  const dLng = transformChinaLng(point.lng - 105, point.lat - 35);
  const radLat = (point.lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  return {
    lat:
      point.lat +
      (dLat * 180) /
        (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI),
    lng:
      point.lng +
      (dLng * 180) /
        ((a / sqrtMagic) * Math.cos(radLat) * Math.PI),
  };
};

export const gcj02ToBd09 = (point: CoordinatePair): CoordinatePair => {
  const z =
    Math.sqrt(point.lng * point.lng + point.lat * point.lat) +
    0.00002 * Math.sin((point.lat * Math.PI * 3000) / 180);
  const theta =
    Math.atan2(point.lat, point.lng) +
    0.000003 * Math.cos((point.lng * Math.PI * 3000) / 180);
  return {
    lat: z * Math.sin(theta) + 0.006,
    lng: z * Math.cos(theta) + 0.0065,
  };
};

export const formatCoordinate = (value: number) => value.toFixed(6);
