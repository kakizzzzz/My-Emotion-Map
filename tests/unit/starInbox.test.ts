import { describe, expect, it } from 'vitest';
import { consumeShortcutHeartFragment } from '../../src/domain/starInbox';

const preferences = {
  restingHeartRateMin: 60,
  restingHeartRateMax: 100,
  rangeConfirmed: true,
  singleSampleEnabled: true,
};
const now = new Date('2026-08-01T08:10:00.000Z');
const hash = (heartRate: number, at = '2026-08-01T08:05:00.000Z') =>
  `#shortcut-heart?v=1&hr=${heartRate}&at=${encodeURIComponent(at)}&eid=sample-1&src=apple-health-shortcut`;

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
      decisionReason: 'low_signal_review',
      thresholdSnapshot: { restingMin: 60, restingMax: 100 },
      algorithmVersion: 'shortcut-fragment-v1',
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

  it('uses the median and requires two of the latest three v2 samples', () => {
    const result = consumeShortcutHeartFragment({
      hash: '#shortcut-heart?v=2&samples=98,126,128&at=2026-08-01T08%3A05%3A00.000Z&eid=v2-1&context=resting',
      preferences: { ...preferences, singleSampleEnabled: false },
      knownEventIds: new Set(),
      now,
    });
    expect(result.kind).toBe('pending');
    if (result.kind === 'pending') expect(result.item.heartRate).toBe(126);
  });

  it('does not apply the resting range during a workout', () => {
    const result = consumeShortcutHeartFragment({
      hash: '#shortcut-heart?v=2&samples=126,128,130&at=2026-08-01T08%3A05%3A00.000Z&eid=v2-workout&context=workout',
      preferences,
      knownEventIds: new Set(),
      now,
    });
    expect(result.kind).toBe('pending');
    if (result.kind === 'pending') {
      expect(result.item.lowSignalConfidence).toBe(true);
      expect(result.item.context).toBe('workout');
      expect(result.item.decisionReason).toBe('non_resting_review');
    }
  });
});
