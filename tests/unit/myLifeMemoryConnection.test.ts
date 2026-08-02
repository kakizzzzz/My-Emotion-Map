import { describe, expect, it, vi } from 'vitest';
import { createMyLifeMemoryConnectionHandlers } from '../../src/services/myLifeMemoryConnection';

describe('My Life Memory browser connection boundary', () => {
  it('sends a token once without endpoint or browser persistence', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        status: 'ok',
        connection: {
          state: 'connected', serverVersion: '2.0.0',
          protocolVersion: '2025-03-26', manifestHash: 'a'.repeat(64),
          connectedAt: '2026-08-02T00:00:00.000Z',
          lastTestAt: '2026-08-02T00:00:00.000Z', lastErrorCode: null,
        },
      },
      error: null,
    });
    const token = `mlm_${'s'.repeat(64)}`;
    const handlers = createMyLifeMemoryConnectionHandlers({
      client: { functions: { invoke } } as never,
      available: true,
    });

    expect(await handlers.connect(token)).toEqual(expect.objectContaining({
      state: 'connected',
    }));
    expect(invoke).toHaveBeenCalledWith('my-life-memory-connection', {
      body: { action: 'connect', token },
    });
    expect(JSON.stringify(invoke.mock.calls)).not.toContain('endpoint');
    expect(JSON.stringify(window.localStorage)).not.toContain(token);
  });

  it('rejects malformed status payloads and never accepts a returned token', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        status: 'ok', token: 'must-not-surface',
        connection: { state: 'connected' },
      },
      error: null,
    });
    const handlers = createMyLifeMemoryConnectionHandlers({
      client: { functions: { invoke } } as never,
      available: true,
    });
    expect(await handlers.status()).toBeNull();
  });
});
