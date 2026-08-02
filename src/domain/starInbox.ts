import type { HealthPreferences, StarInboxItem } from '../types';
import {
  evaluateHeartObservation,
  type HeartContext,
  type HeartObservationPreferences,
  type HeartSample,
} from '../../supabase/functions/_shared/heartObservationV3';

export type ShortcutHeartResult =
  | { kind: 'ignored' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'duplicate'; sourceEventId: string }
  | { kind: 'within-range'; sourceEventId: string }
  | { kind: 'pending'; sourceEventId: string; item: StarInboxItem };

const EVENT_ID = /^[A-Za-z0-9._:-]{1,180}$/;
const OFFSET_TIME = /(Z|[+-]\d{2}:?\d{2})$/i;

const stableEventId = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `local-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const toAlgorithmPreferences = (
  preferences: HealthPreferences,
): HeartObservationPreferences => ({
  min: preferences.restingHeartRateMin,
  max: preferences.restingHeartRateMax,
  singleSampleEnabled: preferences.singleSampleEnabled,
  workoutPolicy: preferences.workoutPolicy,
  unknownPolicy: preferences.unknownPolicy,
  cooldownMinutes: preferences.cooldownMinutes,
});

const parseFragmentSamples = (
  parameters: URLSearchParams,
  version: string,
  fallbackAt: string,
): HeartSample[] | null => {
  if (version === '1') {
    const bpm = Number(parameters.get('hr'));
    return Number.isFinite(bpm) ? [{ bpm, at: fallbackAt }] : null;
  }
  const bpms = (parameters.get('samples') ?? '').split(',').map(Number);
  if (!bpms.length || bpms.some((bpm) => !Number.isFinite(bpm))) return null;
  const timestamps = version === '3'
    ? (parameters.get('sampleAts') ?? '').split('|').map((at) => at.trim())
    : [];
  if (version === '3' && timestamps.length !== bpms.length) return null;
  return bpms.slice(0, 12).map((bpm, index) => ({
    bpm,
    at: timestamps[index] || fallbackAt,
  }));
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
  if (version !== '1' && version !== '2' && version !== '3') {
    return { kind: 'invalid', reason: 'version' };
  }
  const source = parameters.get('src');
  if (source && source !== 'apple-health-shortcut') {
    return { kind: 'invalid', reason: 'source' };
  }
  if (!preferences.rangeConfirmed) {
    return { kind: 'invalid', reason: 'range-unconfirmed' };
  }
  const rawAt = (parameters.get('at') ?? '').trim().replace(' ', '+');
  if (!rawAt || !OFFSET_TIME.test(rawAt)) {
    return { kind: 'invalid', reason: 'sample-time' };
  }
  const context: HeartContext = parameters.get('context') === 'resting' ||
    parameters.get('context') === 'workout'
    ? parameters.get('context') as 'resting' | 'workout'
    : 'unknown';
  const samples = parseFragmentSamples(parameters, version, rawAt);
  if (!samples) return { kind: 'invalid', reason: 'heart-rate' };

  const suppliedId = (parameters.get('eid') ?? '').trim();
  const sourceEventId = EVENT_ID.test(suppliedId)
    ? suppliedId
    : stableEventId(`${rawAt}|${samples.map((sample) => sample.bpm).join(',')}|apple-health-shortcut`);
  if (knownEventIds.has(sourceEventId)) {
    return { kind: 'duplicate', sourceEventId };
  }
  const evaluation = evaluateHeartObservation({
    samples,
    context,
    preferences: toAlgorithmPreferences(preferences),
    now: now.getTime(),
  });
  if (evaluation.decision === 'invalid') {
    return { kind: 'invalid', reason: evaluation.decisionReason };
  }
  if (
    evaluation.decision === 'insufficient_signal' ||
    evaluation.decision === 'suppressed_context'
  ) return { kind: 'ignored' };
  if (evaluation.decision === 'within_range') {
    return { kind: 'within-range', sourceEventId };
  }
  if (evaluation.decision !== 'pending' || evaluation.medianBpm === null) {
    return { kind: 'ignored' };
  }

  return {
    kind: 'pending',
    sourceEventId,
    item: {
      id: `heart-${sourceEventId}`,
      source: 'heart-rate',
      sourceEventId,
      eventAt: evaluation.acceptedSamples[0].at,
      receivedAt: now.toISOString(),
      heartRate: evaluation.medianBpm,
      verification: 'unverified',
      context,
      samples: evaluation.acceptedSamples,
      lowSignalConfidence: evaluation.lowSignal,
      decisionReason: evaluation.decisionReason as NonNullable<
        StarInboxItem['decisionReason']
      >,
      thresholdSnapshot: {
        restingMin: preferences.restingHeartRateMin,
        restingMax: preferences.restingHeartRateMax,
        singleSampleEnabled: preferences.singleSampleEnabled,
        workoutPolicy: preferences.workoutPolicy,
        unknownPolicy: preferences.unknownPolicy,
        cooldownMinutes: preferences.cooldownMinutes,
      },
      algorithmVersion: evaluation.algorithmVersion,
      signalLevel: evaluation.lowSignal ? 'low' : 'standard',
      status: 'pending',
    },
  };
};
