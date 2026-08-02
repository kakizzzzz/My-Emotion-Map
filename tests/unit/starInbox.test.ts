import { describe, expect, it } from 'vitest';
import { consumeShortcutHeartFragment } from '../../src/domain/starInbox';
import { evaluateHeartObservation } from '../../supabase/functions/_shared/heartObservationV3';

const preferences = {
  restingHeartRateMin: 60,
  restingHeartRateMax: 100,
  rangeConfirmed: true,
  singleSampleEnabled: true,
  workoutPolicy: 'suppress' as const,
  unknownPolicy: 'suppress' as const,
  cooldownMinutes: 30,
};
const now = new Date('2026-08-01T08:10:00.000Z');
const hash = (heartRate: number, at = '2026-08-01T08:05:00.000Z') =>
  `#shortcut-heart?v=1&hr=${heartRate}&at=${encodeURIComponent(at)}&eid=sample-1&src=apple-health-shortcut&context=resting`;

describe('Shortcut heart-rate bridge rules', () => {
  it('creates a coordinate-free pending inbox item outside the reference range', () => {
    const result = consumeShortcutHeartFragment({
      hash: hash(126),
      preferences,
      knownEventIds: new Set(),
      now,
    });

    expect(result.kind).toBe('pending');
    if (result.kind !== 'pending') return;
    expect(result.item).toMatchObject({
      heartRate: 126,
      status: 'pending',
      sourceEventId: 'sample-1',
      decisionReason: 'outside_range_single_sample',
      thresholdSnapshot: { restingMin: 60, restingMax: 100 },
      algorithmVersion: 'heart-v3',
      signalLevel: 'low',
    });
    expect(result.item.latitude).toBeUndefined();
    expect(result.item.longitude).toBeUndefined();
  });

  it('treats user threshold boundaries as in range', () => {
    expect(consumeShortcutHeartFragment({
      hash: hash(60), preferences, knownEventIds: new Set(), now,
    }).kind).toBe('within-range');
    expect(consumeShortcutHeartFragment({
      hash: hash(100), preferences, knownEventIds: new Set(), now,
    }).kind).toBe('within-range');
  });

  it('rejects stale, future and physiologically invalid transport values', () => {
    expect(consumeShortcutHeartFragment({
      hash: hash(126, '2026-08-01T07:59:59.000Z'), preferences, knownEventIds: new Set(), now,
    }).kind).toBe('invalid');
    expect(consumeShortcutHeartFragment({
      hash: hash(126, '2026-08-01T08:12:01.000Z'), preferences, knownEventIds: new Set(), now,
    }).kind).toBe('invalid');
    expect(consumeShortcutHeartFragment({
      hash: hash(261), preferences, knownEventIds: new Set(), now,
    }).kind).toBe('invalid');
  });

  it('deduplicates a repeated source event', () => {
    expect(consumeShortcutHeartFragment({
      hash: hash(126), preferences, knownEventIds: new Set(['sample-1']), now,
    }).kind).toBe('duplicate');
  });

  it('uses the same latest-three decision set for a v3 compatibility fragment', () => {
    const result = consumeShortcutHeartFragment({
      hash: '#shortcut-heart?v=3&samples=98,126,128&sampleAts=2026-08-01T08%3A05%3A00.000Z%7C2026-08-01T08%3A04%3A00.000Z%7C2026-08-01T08%3A03%3A00.000Z&at=2026-08-01T08%3A05%3A00.000Z&eid=v3-1&context=resting',
      preferences: { ...preferences, singleSampleEnabled: false },
      knownEventIds: new Set(),
      now,
    });
    expect(result.kind).toBe('pending');
    if (result.kind === 'pending') {
      const direct = evaluateHeartObservation({
        samples: [
          { bpm: 98, at: '2026-08-01T08:05:00.000Z' },
          { bpm: 126, at: '2026-08-01T08:04:00.000Z' },
          { bpm: 128, at: '2026-08-01T08:03:00.000Z' },
        ],
        context: 'resting',
        preferences: {
          min: 60, max: 100, singleSampleEnabled: false,
          workoutPolicy: 'suppress', unknownPolicy: 'suppress', cooldownMinutes: 30,
        },
        now: now.getTime(),
      });
      expect(result.item).toMatchObject({
        heartRate: direct.medianBpm,
        decisionReason: direct.decisionReason,
        algorithmVersion: direct.algorithmVersion,
        samples: direct.acceptedSamples,
      });
    }
  });

  it('suppresses workout by default and only reviews it after explicit opt-in', () => {
    const workoutHash = '#shortcut-heart?v=3&samples=126,128,130&sampleAts=2026-08-01T08%3A05%3A00.000Z%7C2026-08-01T08%3A04%3A00.000Z%7C2026-08-01T08%3A03%3A00.000Z&at=2026-08-01T08%3A05%3A00.000Z&eid=v3-workout&context=workout';
    expect(consumeShortcutHeartFragment({
      hash: workoutHash,
      preferences,
      knownEventIds: new Set(),
      now,
    }).kind).toBe('ignored');
    const result = consumeShortcutHeartFragment({
      hash: workoutHash,
      preferences: { ...preferences, workoutPolicy: 'post_workout_review' },
      knownEventIds: new Set(),
      now,
    });
    expect(result.kind).toBe('pending');
    if (result.kind === 'pending') {
      expect(result.item.lowSignalConfidence).toBe(false);
      expect(result.item.context).toBe('workout');
      expect(result.item.decisionReason).toBe('post_workout_review');
    }
  });
});
