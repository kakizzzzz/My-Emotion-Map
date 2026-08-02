import { describe, expect, it } from 'vitest';
import {
  evaluateHeartObservation,
  heartEpisodeKey,
  shouldMergeHeartEpisode,
} from '../../supabase/functions/_shared/heartObservationV3';

const now = Date.parse('2026-08-02T08:10:00.000Z');
const preferences = {
  min: 60,
  max: 100,
  singleSampleEnabled: false,
  workoutPolicy: 'suppress' as const,
  unknownPolicy: 'suppress' as const,
  cooldownMinutes: 30,
};
const sample = (bpm: number, minute: number) => ({
  bpm,
  at: `2026-08-02T08:${String(minute).padStart(2, '0')}:00.000Z`,
});

describe('shared heart-v3 algorithm', () => {
  it('rejects a fresh sample mixed with stale samples', () => {
    const result = evaluateHeartObservation({
      samples: [sample(120, 9), { bpm: 121, at: '2026-08-02T07:00:00.000Z' }],
      context: 'resting', preferences, now,
    });
    expect(result).toMatchObject({ decision: 'invalid', medianBpm: null });
  });

  it('uses exactly the latest three samples for decision and displayed median', () => {
    const result = evaluateHeartObservation({
      samples: [sample(110, 9), sample(120, 8), sample(130, 7), sample(70, 6)],
      context: 'resting', preferences, now,
    });
    expect(result).toMatchObject({
      decision: 'pending', medianBpm: 120, sampleCount: 3,
      decisionReason: 'outside_range', side: 'high', algorithmVersion: 'heart-v3',
    });
    expect(result.acceptedSamples.map((item) => item.bpm)).toEqual([110, 120, 130]);
  });

  it('rejects reverse timestamp order and deduplicates equal timestamps', () => {
    expect(evaluateHeartObservation({
      samples: [sample(110, 8), sample(112, 9)],
      context: 'resting', preferences, now,
    })).toMatchObject({ decision: 'invalid', decisionReason: 'invalid_sample_order' });
    expect(evaluateHeartObservation({
      samples: [sample(110, 9), sample(110, 9), sample(112, 8)],
      context: 'resting',
      preferences: { ...preferences, singleSampleEnabled: true },
      now,
    })).toMatchObject({ sampleCount: 2, medianBpm: 111 });
  });

  it('averages an even decision set and rounds once', () => {
    expect(evaluateHeartObservation({
      samples: [sample(111, 9), sample(112, 8)],
      context: 'resting',
      preferences: { ...preferences, singleSampleEnabled: true },
      now,
    })).toMatchObject({ decision: 'pending', medianBpm: 112 });
  });

  it('suppresses workout and unknown contexts by default', () => {
    for (const context of ['workout', 'unknown'] as const) {
      expect(evaluateHeartObservation({
        samples: [sample(130, 9), sample(128, 8), sample(126, 7)],
        context, preferences, now,
      }).decision).toBe('suppressed_context');
    }
  });

  it('makes strict unknown and single-sample choices explicit and predictable', () => {
    expect(evaluateHeartObservation({
      samples: [sample(112, 9), sample(111, 8), sample(70, 7)],
      context: 'unknown',
      preferences: { ...preferences, unknownPolicy: 'strict_review' },
      now,
    }).decision).toBe('pending');
    expect(evaluateHeartObservation({
      samples: [sample(112, 9)], context: 'resting', preferences, now,
    }).decision).toBe('insufficient_signal');
    expect(evaluateHeartObservation({
      samples: [sample(112, 9)], context: 'resting',
      preferences: { ...preferences, singleSampleEnabled: true }, now,
    }).decision).toBe('pending');
  });

  it('merges only the same side/context inside the cooldown window', () => {
    const high = heartEpisodeKey('user-1', 'high', 'resting');
    const low = heartEpisodeKey('user-1', 'low', 'resting');
    const base = {
      existingEpisodeKey: high,
      existingLastSampleAt: '2026-08-02T08:00:00.000Z',
      nextEpisodeKey: high,
      nextLastSampleAt: '2026-08-02T08:29:00.000Z',
      cooldownMinutes: 30,
    };
    expect(shouldMergeHeartEpisode(base)).toBe(true);
    expect(shouldMergeHeartEpisode({
      ...base, nextLastSampleAt: '2026-08-02T08:31:00.000Z',
    })).toBe(false);
    expect(shouldMergeHeartEpisode({ ...base, nextEpisodeKey: low })).toBe(false);
  });
});
