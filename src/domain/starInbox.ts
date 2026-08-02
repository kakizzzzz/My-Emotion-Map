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
  const version = parameters.get('v');
  if (version !== '1' && version !== '2') return { kind: 'invalid', reason: 'version' };
  const source = parameters.get('src');
  if (source && source !== 'apple-health-shortcut') {
    return { kind: 'invalid', reason: 'source' };
  }
  if (!preferences.rangeConfirmed) return { kind: 'invalid', reason: 'range-unconfirmed' };
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
  const context = parameters.get('context') === 'resting' || parameters.get('context') === 'workout'
    ? parameters.get('context') as 'resting' | 'workout'
    : 'unknown';
  const sampleValues = version === '2'
    ? (parameters.get('samples') ?? '')
        .split(',')
        .map(Number)
        .filter((value) => Number.isFinite(value) && value >= 20 && value <= 260)
        .slice(0, 12)
    : [Number(parameters.get('hr'))];
  if (!sampleValues.length || sampleValues.some((value) => value < 20 || value > 260)) {
    return { kind: 'invalid', reason: 'heart-rate' };
  }
  if (version === '1' && !preferences.singleSampleEnabled) {
    return { kind: 'invalid', reason: 'single-sample-disabled' };
  }
  const sorted = [...sampleValues].sort((left, right) => left - right);
  const heartRate = sorted[Math.floor(sorted.length / 2)];
  const sourceEventId = EVENT_ID.test(suppliedId)
    ? suppliedId
    : stableEventId(`${rawAt}|${sampleValues.join(',')}|apple-health-shortcut`);
  if (knownEventIds.has(sourceEventId)) {
    return { kind: 'duplicate', sourceEventId };
  }
  const outsideCount = sampleValues.filter(
    (value) =>
      value < preferences.restingHeartRateMin ||
      value > preferences.restingHeartRateMax,
  ).length;
  if ((version === '2' && context === 'resting' &&
      sampleValues.length >= 3 && outsideCount < 2) ||
    (version === '1' && outsideCount === 0)) {
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
      verification: 'unverified',
      context,
      samples: sampleValues.map((bpm) => ({ bpm: Math.round(bpm), at: rawAt })),
      lowSignalConfidence:
        version === '1' || sampleValues.length < 3 || context !== 'resting',
      decisionReason:
        version === '1' || sampleValues.length < 3
            ? 'low_signal_review'
          : context !== 'resting'
            ? 'non_resting_review'
            : 'outside_resting_range',
      thresholdSnapshot: {
        restingMin: preferences.restingHeartRateMin,
        restingMax: preferences.restingHeartRateMax,
      },
      algorithmVersion: `shortcut-fragment-v${version}`,
      signalLevel:
        version === '1' || sampleValues.length < 3 || context !== 'resting'
          ? 'low'
          : 'standard',
      status: 'pending',
    },
  };
};
