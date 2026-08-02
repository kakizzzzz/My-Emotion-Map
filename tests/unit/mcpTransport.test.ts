import { describe, expect, it, vi } from 'vitest';
import {
  dispatchMcpEnvelope,
  negotiateMcpProtocol,
} from '../../supabase/functions/_shared/mcpTransport';

describe('stateless MCP transport', () => {
  it('negotiates only supported protocol versions', () => {
    expect(negotiateMcpProtocol('2025-06-18')).toBe('2025-06-18');
    expect(negotiateMcpProtocol('2025-03-26')).toBe('2025-03-26');
    expect(negotiateMcpProtocol('2099-01-01')).toBeNull();
  });

  it('omits notification responses while returning batch request results', async () => {
    const handler = vi.fn(async (message) => ({ echoed: message.method }));
    const response = await dispatchMcpEnvelope([
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 7, method: 'ping' },
    ], handler);
    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { jsonrpc: '2.0', id: 7, result: { echoed: 'ping' } },
    ]);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('returns no JSON-RPC body for an all-notification request', async () => {
    const response = await dispatchMcpEnvelope(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      async () => ({}),
    );
    expect(response).toEqual({ status: 202, body: null });
  });

  it('rejects empty, oversized and illegal-id batches', async () => {
    const handler = async () => ({});
    expect((await dispatchMcpEnvelope([], handler)).body).toMatchObject({
      error: { code: -32600 },
    });
    expect((await dispatchMcpEnvelope(
      Array.from({ length: 17 }, (_, id) => ({ jsonrpc: '2.0', id, method: 'ping' })),
      handler,
    )).body).toMatchObject({ error: { code: -32600 } });
    expect((await dispatchMcpEnvelope(
      { jsonrpc: '2.0', id: null, method: 'ping' }, handler,
    )).body).toMatchObject({ error: { code: -32600 } });
  });

  it('requires IDs on requests and forbids IDs on notifications', async () => {
    const handler = async () => ({});
    expect((await dispatchMcpEnvelope(
      { jsonrpc: '2.0', method: 'initialize', params: {} }, handler,
    )).body).toMatchObject({ error: { code: -32600 } });
    expect((await dispatchMcpEnvelope(
      { jsonrpc: '2.0', id: 1, method: 'notifications/initialized' }, handler,
    )).body).toMatchObject({ error: { code: -32600 } });
  });
});
