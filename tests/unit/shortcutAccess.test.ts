import { describe, expect, it, vi } from 'vitest';
import { createShortcutAccessHandlers } from '../../src/services/shortcutAccess';

const preferences = {
  restingHeartRateMin: 60,
  restingHeartRateMax: 100,
  rangeConfirmed: true,
  singleSampleEnabled: false,
  workoutPolicy: 'suppress' as const,
  unknownPolicy: 'suppress' as const,
  cooldownMinutes: 30,
};

const statusClient = (row: Record<string, unknown>) => {
  const limit = vi.fn().mockResolvedValue({ data: [row], error: null });
  const order = vi.fn(() => ({ limit }));
  const select = vi.fn(() => ({ order }));
  return { client: { from: vi.fn(() => ({ select })), rpc: vi.fn() } as never };
};

describe('Shortcut connection lifecycle', () => {
  it('reports verified only for a current token with the same policy snapshot', async () => {
    const { client } = statusClient({
      expires_at: '2099-09-01T00:00:00.000Z',
      revoked_at: null,
      algorithm_version: 'heart-v3',
      shortcut_version: 'shortcut-v3',
      single_sample_enabled: false,
      workout_policy: 'suppress',
      unknown_policy: 'suppress',
      cooldown_minutes: 30,
      resting_min: 60,
      resting_max: 100,
      last_received_at: '2026-08-02T08:00:00.000Z',
      last_test_at: '2026-08-02T08:00:00.000Z',
    });
    const handlers = createShortcutAccessHandlers({
      client, userId: 'user-a', available: true, preferences,
    });
    expect(await handlers.getShortcutConnectionStatus()).toMatchObject({
      state: 'verified',
      algorithmVersion: 'heart-v3',
      shortcutVersion: 'shortcut-v3',
    });
  });

  it('does not silently reinterpret a token after local policy changes', async () => {
    const { client } = statusClient({
      expires_at: '2099-09-01T00:00:00.000Z',
      revoked_at: null,
      algorithm_version: 'heart-v3',
      shortcut_version: 'shortcut-v3',
      single_sample_enabled: true,
      workout_policy: 'suppress',
      unknown_policy: 'suppress',
      cooldown_minutes: 30,
      resting_min: 60,
      resting_max: 100,
    });
    const handlers = createShortcutAccessHandlers({
      client, userId: 'user-a', available: true, preferences,
    });
    expect(await handlers.getShortcutConnectionStatus()).toMatchObject({
      state: 'disconnected',
    });
  });
});
