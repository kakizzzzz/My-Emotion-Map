import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useFollowUpScheduler } from '../../src/app/useFollowUpScheduler';
import type { FollowUpRecord } from '../../src/types';

const DAY_MS = 86_400_000;
const makeFollowUp = (
  dueAt: string,
  status: FollowUpRecord['status'] = 'queued',
): FollowUpRecord => ({
  id: 'follow-up-test',
  noteId: 'note-test',
  intervalDays: 31,
  dueAt,
  status,
  promptVersion: 2,
  followUpConsentedAt: '2026-08-01T00:00:00.000Z',
});

const useHarness = (initial: FollowUpRecord[]) => {
  const [records, setRecords] = useState(initial);
  useFollowUpScheduler(records, setRecords);
  return records;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('follow-up scheduler', () => {
  it('keeps scheduling past the browser timeout ceiling', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    const { result } = renderHook(() => useHarness([
      makeFollowUp('2026-09-01T00:00:00.000Z'),
    ]));

    act(() => vi.advanceTimersByTime(25 * DAY_MS));
    expect(result.current[0].status).toBe('queued');
    act(() => vi.advanceTimersByTime(7 * DAY_MS));
    expect(result.current[0].status).toBe('active');
  });

  it('rechecks when the app regains focus after the clock moves forward', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    const { result } = renderHook(() => useHarness([
      makeFollowUp('2026-08-02T00:00:00.000Z'),
    ]));

    vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current[0].status).toBe('active');
  });

  it('returns a future active task to the queue after a clock rollback', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    const { result } = renderHook(() => useHarness([
      makeFollowUp('2026-08-02T00:00:00.000Z', 'active'),
    ]));

    act(() => vi.advanceTimersByTime(0));
    expect(result.current[0].status).toBe('queued');
  });
});
