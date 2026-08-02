import { describe, expect, it } from 'vitest';
import { createDemoAppData } from '../../src/app/appDataRepository';
import {
  DEMO_FIT_PADDING,
  getMomentBounds,
  shouldFitDemoWorkspace,
} from '../../src/features/map/demoViewport';

describe('Demo map bounds', () => {
  const demo = createDemoAppData(new Date('2026-08-02T12:00:00'));

  it('builds real geographic bounds and layout-aware padding', () => {
    const bounds = getMomentBounds(demo.moments);
    expect(bounds).toEqual([
      [expect.any(Number), expect.any(Number)],
      [expect.any(Number), expect.any(Number)],
    ]);
    expect(bounds?.[0][0]).toBeLessThan(bounds?.[1][0] ?? 0);
    expect(bounds?.[0][1]).toBeLessThan(bounds?.[1][1] ?? 0);
    expect(DEMO_FIT_PADDING.portrait.top).toBeGreaterThanOrEqual(72);
    expect(DEMO_FIT_PADDING.landscape.left).toBeGreaterThanOrEqual(72);
  });

  it('fits once per Demo workspace generation and never fits real workspaces', () => {
    expect(shouldFitDemoWorkspace({
      dataMode: 'demo', workspaceKey: 'demo', handledWorkspaceKey: null,
    })).toBe(true);
    expect(shouldFitDemoWorkspace({
      dataMode: 'demo', workspaceKey: 'demo', handledWorkspaceKey: 'demo',
    })).toBe(false);
    expect(shouldFitDemoWorkspace({
      dataMode: 'real', workspaceKey: 'real:user-a', handledWorkspaceKey: null,
    })).toBe(false);
  });
});
