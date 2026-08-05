import type { EventTimeSource, TemporalFields } from '../../types';

const ISO_WITH_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

const timestampOffsetMinutes = (value: string) => {
  const match = ISO_WITH_OFFSET.exec(value)?.[1];
  if (!match) return null;
  if (match.toUpperCase() === 'Z') return 0;
  const sign = match.startsWith('-') ? -1 : 1;
  const digits = match.slice(1).replace(':', '');
  return sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2)));
};

const safeTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

export const currentUtcOffsetMinutes = (date = new Date()) => {
  const offset = -date.getTimezoneOffset();
  return Object.is(offset, -0) ? 0 : offset;
};

export type DeviceTemporalContext = {
  localDate: string;
  localTime: string;
  timeZone: string | null;
  utcOffsetMinutes: number;
};

const twoDigits = (value: number) => String(value).padStart(2, '0');

export const createDeviceTemporalContext = (
  date = new Date(),
): DeviceTemporalContext => ({
  localDate: [
    date.getFullYear(),
    twoDigits(date.getMonth() + 1),
    twoDigits(date.getDate()),
  ].join('-'),
  localTime: [twoDigits(date.getHours()), twoDigits(date.getMinutes())].join(':'),
  timeZone: safeTimeZone(),
  utcOffsetMinutes: currentUtcOffsetMinutes(date),
});

export const createTemporalFields = ({
  localDate,
  localTime,
  source,
  sourceTimestamp,
  timeZone = safeTimeZone(),
}: {
  localDate: string;
  localTime: string;
  source: EventTimeSource;
  sourceTimestamp?: string | null;
  timeZone?: string | null;
}): TemporalFields => {
  const hasTrustedOffset = Boolean(
    sourceTimestamp && ISO_WITH_OFFSET.test(sourceTimestamp),
  );
  const occurredAtUtc = hasTrustedOffset
    ? new Date(sourceTimestamp as string).toISOString()
    : source === 'photo-exif'
      ? null
      : new Date(`${localDate}T${localTime}:00`).toISOString();
  return {
    occurredAtUtc,
    localDate,
    localTime,
    timeZone: source === 'photo-exif' && !hasTrustedOffset ? null : timeZone,
    utcOffsetMinutes: hasTrustedOffset
      ? timestampOffsetMinutes(sourceTimestamp as string)
      : source === 'photo-exif'
        ? null
        : currentUtcOffsetMinutes(
            occurredAtUtc ? new Date(occurredAtUtc) : new Date(),
          ),
    timePrecision: 'minute',
    eventTimeSource: source,
  };
};

export const migrateLegacyTemporalFields = (
  value: Partial<TemporalFields> & {
    date: string;
    time: string;
    eventTimeSource?: EventTimeSource;
  },
): TemporalFields => ({
  occurredAtUtc:
    typeof value.occurredAtUtc === 'string' ? value.occurredAtUtc : null,
  localDate: value.localDate || value.date,
  localTime: value.localTime || value.time,
  timeZone: typeof value.timeZone === 'string' ? value.timeZone : null,
  utcOffsetMinutes:
    typeof value.utcOffsetMinutes === 'number' &&
    Number.isFinite(value.utcOffsetMinutes)
      ? value.utcOffsetMinutes
      : null,
  timePrecision:
    value.timePrecision === 'date' || value.timePrecision === 'unknown'
      ? value.timePrecision
      : 'minute',
  eventTimeSource: value.eventTimeSource ?? 'legacy',
});

export const temporalSortValue = (
  value: Pick<TemporalFields, 'occurredAtUtc' | 'localDate' | 'localTime'>,
) =>
  value.occurredAtUtc
    ? new Date(value.occurredAtUtc).getTime()
    : Date.parse(`${value.localDate}T${value.localTime}:00`);
