export const HEART_ALGORITHM_VERSION = 'heart-v3';
export const SHORTCUT_VERSION = 'shortcut-v3';
export const HEART_SINGLE_SAMPLE_MARGIN_BPM = 5;

export type HeartContext = 'resting' | 'workout' | 'unknown';
export type HeartSide = 'high' | 'low';
export type HeartSample = { bpm: number; at: string };
export type HeartObservationPreferences = {
  min: number;
  max: number;
  singleSampleEnabled: boolean;
  workoutPolicy: 'suppress' | 'post_workout_review';
  unknownPolicy: 'suppress' | 'strict_review';
  cooldownMinutes: number;
};
export type HeartDecision =
  | 'pending'
  | 'within_range'
  | 'insufficient_signal'
  | 'suppressed_context'
  | 'duplicate'
  | 'invalid';

export type HeartObservationResult = {
  decision: HeartDecision;
  medianBpm: number | null;
  decisionReason: string;
  sampleCount: number;
  algorithmVersion: typeof HEART_ALGORITHM_VERSION;
  thresholdSnapshot: HeartObservationPreferences;
  lowSignal: boolean;
  side: HeartSide | null;
  acceptedSamples: HeartSample[];
};

const OFFSET_TIME = /(Z|[+-]\d{2}:?\d{2})$/i;
const MAX_AGE_MS = 10 * 60_000;
const MAX_FUTURE_MS = 2 * 60_000;

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(value);
};

const result = (
  preferences: HeartObservationPreferences,
  decision: HeartDecision,
  decisionReason: string,
  acceptedSamples: HeartSample[] = [],
  side: HeartSide | null = null,
  lowSignal = false,
): HeartObservationResult => ({
  decision,
  medianBpm: acceptedSamples.length
    ? median(acceptedSamples.map((sample) => sample.bpm))
    : null,
  decisionReason,
  sampleCount: acceptedSamples.length,
  algorithmVersion: HEART_ALGORITHM_VERSION,
  thresholdSnapshot: { ...preferences },
  lowSignal,
  side,
  acceptedSamples,
});

const pendingSide = (
  samples: HeartSample[],
  preferences: HeartObservationPreferences,
  margin = 0,
) => {
  const high = samples.filter((sample) => sample.bpm > preferences.max + margin).length;
  const low = samples.filter((sample) => sample.bpm < preferences.min - margin).length;
  const needed = Math.max(1, Math.ceil(samples.length * 2 / 3));
  if (high >= needed) return 'high' as const;
  if (low >= needed) return 'low' as const;
  return null;
};

export const evaluateHeartObservation = ({
  samples,
  context,
  preferences,
  now,
  test = false,
}: {
  samples: HeartSample[];
  context: HeartContext;
  preferences: HeartObservationPreferences;
  now: number;
  test?: boolean;
}): HeartObservationResult => {
  if (
    !Number.isFinite(now) || !Array.isArray(samples) ||
    samples.length < 1 || samples.length > 12 ||
    !Number.isFinite(preferences.min) || !Number.isFinite(preferences.max) ||
    preferences.min < 35 || preferences.min > 180 ||
    preferences.max < 40 || preferences.max > 220 ||
    preferences.max <= preferences.min ||
    (preferences.workoutPolicy !== 'suppress' &&
      preferences.workoutPolicy !== 'post_workout_review') ||
    (preferences.unknownPolicy !== 'suppress' &&
      preferences.unknownPolicy !== 'strict_review') ||
    (context !== 'resting' && context !== 'workout' && context !== 'unknown') ||
    !Number.isInteger(preferences.cooldownMinutes) ||
    preferences.cooldownMinutes < 5 || preferences.cooldownMinutes > 180
  ) return result(preferences, 'invalid', 'invalid_input');

  const byTimestamp = new Map<number, HeartSample>();
  let previousTimestamp = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const sampledAt = typeof sample?.at === 'string' ? Date.parse(sample.at) : NaN;
    if (
      typeof sample?.bpm !== 'number' || !Number.isFinite(sample.bpm) ||
      sample.bpm < 20 || sample.bpm > 260 ||
      !OFFSET_TIME.test(sample.at) || Number.isNaN(sampledAt) ||
      sampledAt > now + MAX_FUTURE_MS || now - sampledAt > MAX_AGE_MS
    ) return result(preferences, 'invalid', 'invalid_sample');
    if (sampledAt > previousTimestamp) {
      return result(preferences, 'invalid', 'invalid_sample_order');
    }
    previousTimestamp = sampledAt;
    const roundedBpm = Math.round(sample.bpm);
    const existing = byTimestamp.get(sampledAt);
    if (existing && existing.bpm !== roundedBpm) {
      return result(preferences, 'invalid', 'conflicting_duplicate_sample');
    }
    if (!existing) byTimestamp.set(sampledAt, { bpm: roundedBpm, at: sample.at });
  }
  const unique = [...byTimestamp.entries()]
    .sort((left, right) => right[0] - left[0]);
  if (!unique.length || unique[0][0] - unique.at(-1)![0] > MAX_AGE_MS) {
    return result(preferences, 'invalid', 'invalid_sample_span');
  }
  const accepted = unique.slice(0, 3).map(([, sample]) => sample);
  const lowSignal = accepted.length < 3;

  if (test) {
    const side = median(accepted.map((sample) => sample.bpm)) > preferences.max
      ? 'high'
      : median(accepted.map((sample) => sample.bpm)) < preferences.min
        ? 'low'
        : null;
    return result(preferences, 'pending', 'pending_test', accepted, side, lowSignal);
  }

  if (context === 'workout' && preferences.workoutPolicy === 'suppress') {
    return result(preferences, 'suppressed_context', 'suppressed_workout', accepted, null, lowSignal);
  }
  if (context === 'unknown' && preferences.unknownPolicy === 'suppress') {
    return result(preferences, 'suppressed_context', 'suppressed_unknown', accepted, null, lowSignal);
  }

  if (context === 'resting' && accepted.length < 3) {
    if (!preferences.singleSampleEnabled) {
      return result(preferences, 'insufficient_signal', 'insufficient_resting_samples', accepted, null, true);
    }
    const side = pendingSide(accepted, preferences, HEART_SINGLE_SAMPLE_MARGIN_BPM);
    return side
      ? result(preferences, 'pending', 'outside_range_single_sample', accepted, side, true)
      : result(preferences, 'within_range', 'inside_margin', accepted, null, true);
  }

  const strictContext = context !== 'resting';
  if (strictContext && accepted.length < 3) {
    return result(preferences, 'insufficient_signal', 'insufficient_context_samples', accepted, null, true);
  }
  const side = pendingSide(
    accepted,
    preferences,
    strictContext ? HEART_SINGLE_SAMPLE_MARGIN_BPM : 0,
  );
  if (!side) {
    return result(preferences, 'within_range', 'within_range', accepted, null, lowSignal);
  }
  const reason = context === 'resting'
    ? 'outside_range'
    : context === 'workout'
      ? 'post_workout_review'
      : 'unknown_strict_review';
  return result(preferences, 'pending', reason, accepted, side, lowSignal);
};

export const heartEpisodeKey = (
  userId: string,
  side: HeartSide,
  context: HeartContext,
) => `${userId}:${side}:${context}`;

export const shouldMergeHeartEpisode = ({
  existingEpisodeKey,
  existingLastSampleAt,
  nextEpisodeKey,
  nextLastSampleAt,
  cooldownMinutes,
}: {
  existingEpisodeKey: string;
  existingLastSampleAt: string;
  nextEpisodeKey: string;
  nextLastSampleAt: string;
  cooldownMinutes: number;
}) => existingEpisodeKey === nextEpisodeKey &&
  Date.parse(nextLastSampleAt) >= Date.parse(existingLastSampleAt) &&
  Date.parse(nextLastSampleAt) - Date.parse(existingLastSampleAt) <=
    cooldownMinutes * 60_000;
