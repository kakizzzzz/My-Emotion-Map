import { describe, expect, it, vi } from 'vitest';
import {
  ackShortcutObservationRows,
  fetchShortcutObservationPages,
  mergeShortcutObservationItems,
  parseShortcutObservationRow,
  type ShortcutObservationRow,
} from '../../src/features/inbox/shortcutDelivery';

const row = (index: number): ShortcutObservationRow => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  event_id: `event-${index}`,
  sampled_at: `2026-08-02T08:${String(index % 60).padStart(2, '0')}:00.000Z`,
  context: 'resting',
  samples: [{ bpm: 120, at: '2026-08-02T08:00:00.000Z' }],
  median_bpm: 120,
  is_test: false,
  low_signal: false,
  decision_reason: 'outside_range',
  threshold_snapshot: {
    restingMin: 60, restingMax: 100, singleSampleEnabled: false,
    workoutPolicy: 'suppress', unknownPolicy: 'suppress', cooldownMinutes: 30,
  },
  algorithm_version: 'heart-v3',
  signal_level: 'standard',
  repeat_count: 1,
  created_at: `2026-08-02T09:${String(index % 60).padStart(2, '0')}:00.000Z`,
  status: 'pending',
});

describe('Shortcut delivery cursor and acknowledgement', () => {
  it('paginates past the first 20 rows and a failed ack remains retryable', async () => {
    const rows = Array.from({ length: 25 }, (_, index) => row(index));
    let listCall = 0;
    let ackFails = true;
    const rpc = vi.fn(async (name: string) => {
      if (name === 'list_shortcut_observations_page') {
        const data = listCall === 0 ? rows.slice(0, 20) : rows.slice(20);
        listCall += 1;
        return { data, error: null };
      }
      return { data: null, error: ackFails ? { message: 'offline' } : null };
    });
    const client = { rpc };
    const firstPull = await fetchShortcutObservationPages(client);
    expect(firstPull).toHaveLength(25);
    expect(rpc).toHaveBeenNthCalledWith(2, 'list_shortcut_observations_page', {
      p_after_created_at: rows[19].created_at,
      p_after_id: rows[19].id,
      p_limit: 20,
    });
    const parsed = firstPull!.flatMap((item) => {
      const parsedItem = parseShortcutObservationRow(item);
      return parsedItem ? [parsedItem] : [];
    });
    const local = mergeShortcutObservationItems([], parsed);
    expect(local).toHaveLength(25);
    expect(await ackShortcutObservationRows(client, firstPull!)).toBe(false);

    ackFails = false;
    expect(await ackShortcutObservationRows(client, firstPull!)).toBe(true);
    expect(mergeShortcutObservationItems(local, parsed)).toHaveLength(25);
    expect(rpc).toHaveBeenCalledWith(
      'ack_shortcut_observations',
      { p_ids: rows.map((item) => item.id) },
    );
  });

  it('updates a merged episode in place instead of creating a second card', () => {
    const original = parseShortcutObservationRow(row(1))!;
    const updated = parseShortcutObservationRow({
      ...row(1), median_bpm: 132, repeat_count: 3,
    })!;
    const merged = mergeShortcutObservationItems([original], [updated]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ heartRate: 132, repeatCount: 3 });
  });
});
