import type { HealthPreferences, StarInboxItem } from '../types';

export type ShortcutHeartResult =
  | { kind: 'ignored' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'duplicate'; sourceEventId: string }
  | { kind: 'within-range'; sourceEventId: string }
  | { kind: 'pending'; sourceEventId: string; item: StarInboxItem };

const EVENT_ID = /^[A-Za-z0-9._:-]{1,180}$/;

const stableEventId = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `local-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

export const consumeShortcutHeartFragment = ({
  hash,
  preferences,
  knownEventIds,
  now = new Date(),
}: {
  hash: string;
  preferences: HealthPreferences;
  knownEventIds: ReadonlySet<string>;
  now?: Date;
}): ShortcutHeartResult => {
  if (!hash.startsWith('#shortcut-heart')) return { kind: 'ignored' };
  const query = hash.startsWith('#shortcut-heart?')
    ? hash.slice('#shortcut-heart?'.length)
    : '';
  const parameters = new URLSearchParams(query);
  if (parameters.get('v') !== '1') return { kind: 'invalid', reason: 'version' };
  const source = parameters.get('src');
  if (source && source !== 'apple-health-shortcut') {
    return { kind: 'invalid', reason: 'source' };
  }
  const heartRate = Number(parameters.get('hr'));
  if (!Number.isFinite(heartRate) || heartRate < 20 || heartRate > 260) {
    return { kind: 'invalid', reason: 'heart-rate' };
  }
  const rawAt = (parameters.get('at') ?? '').trim().replace(' ', '+');
  const sampledTime = new Date(rawAt).getTime();
  if (!rawAt || Number.isNaN(sampledTime)) {
    return { kind: 'invalid', reason: 'sample-time' };
  }
  const ageMs = now.getTime() - sampledTime;
  if (ageMs < -2 * 60_000 || ageMs > 10 * 60_000) {
    return { kind: 'invalid', reason: 'freshness' };
  }
  const suppliedId = (parameters.get('eid') ?? '').trim();
  const sourceEventId = EVENT_ID.test(suppliedId)
    ? suppliedId
    : stableEventId(`${rawAt}|${heartRate}|apple-health-shortcut`);
  if (knownEventIds.has(sourceEventId)) {
    return { kind: 'duplicate', sourceEventId };
  }
  if (
    heartRate >= preferences.restingHeartRateMin &&
    heartRate <= preferences.restingHeartRateMax
  ) {
    return { kind: 'within-range', sourceEventId };
  }
  return {
    kind: 'pending',
    sourceEventId,
    item: {
      id: `heart-${sourceEventId}`,
      source: 'heart-rate',
      sourceEventId,
      eventAt: rawAt,
      receivedAt: now.toISOString(),
      heartRate: Math.round(heartRate),
      status: 'pending',
    },
  };
};
