import type { SupabaseClient } from '@supabase/supabase-js';

export type MyLifeMemoryConnectionStatus = {
  state: 'disconnected' | 'connected' | 'unavailable';
  serverVersion: string | null;
  protocolVersion: string | null;
  manifestHash: string | null;
  connectedAt: string | null;
  lastTestAt: string | null;
  lastErrorCode: string | null;
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const nullableString = (value: unknown, max: number) =>
  value === null || value === undefined
    ? null
    : typeof value === 'string' && value.length <= max
      ? value
      : undefined;

const validateStatus = (value: unknown): MyLifeMemoryConnectionStatus | null => {
  const payload = asObject(value);
  if (!payload || Object.keys(payload).some((key) =>
    key !== 'status' && key !== 'connection') || payload.status !== 'ok') return null;
  const connection = asObject(payload.connection);
  if (!connection || Object.keys(connection).some((key) => ![
    'state', 'serverVersion', 'protocolVersion', 'manifestHash',
    'connectedAt', 'lastTestAt', 'lastErrorCode',
  ].includes(key))) return null;
  if (connection.state !== 'disconnected' &&
    connection.state !== 'connected' && connection.state !== 'unavailable') return null;
  const serverVersion = nullableString(connection.serverVersion, 80);
  const protocolVersion = nullableString(connection.protocolVersion, 40);
  const manifestHash = nullableString(connection.manifestHash, 64);
  const connectedAt = nullableString(connection.connectedAt, 40);
  const lastTestAt = nullableString(connection.lastTestAt, 40);
  const lastErrorCode = nullableString(connection.lastErrorCode, 80);
  if ([serverVersion, protocolVersion, manifestHash, connectedAt, lastTestAt, lastErrorCode]
    .some((item) => item === undefined)) return null;
  if (manifestHash && !/^[a-f0-9]{64}$/.test(manifestHash)) return null;
  if (connection.state === 'connected' &&
    (!serverVersion || !protocolVersion || !manifestHash || !connectedAt || !lastTestAt)) return null;
  return {
    state: connection.state,
    serverVersion: serverVersion ?? null,
    protocolVersion: protocolVersion ?? null,
    manifestHash: manifestHash ?? null,
    connectedAt: connectedAt ?? null,
    lastTestAt: lastTestAt ?? null,
    lastErrorCode: lastErrorCode ?? null,
  };
};

export const createMyLifeMemoryConnectionHandlers = ({
  client,
  available,
}: {
  client: SupabaseClient | null;
  available: boolean;
}) => {
  const invoke = async (
    action: 'connect' | 'test' | 'status' | 'disconnect',
    token?: string,
  ) => {
    if (!client || !available) return null;
    const body = action === 'connect' ? { action, token } : { action };
    const { data, error } = await client.functions.invoke(
      'my-life-memory-connection',
      { body },
    );
    return error ? null : validateStatus(data);
  };
  return {
    connect: (token: string) => invoke('connect', token),
    test: () => invoke('test'),
    status: () => invoke('status'),
    disconnect: () => invoke('disconnect'),
  };
};

