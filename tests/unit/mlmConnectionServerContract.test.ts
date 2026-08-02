import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/202608020004_phase4_mlm_input.sql'),
  'utf8',
);
const edge = readFileSync(
  resolve(process.cwd(), 'supabase/functions/my-life-memory-connection/index.ts'),
  'utf8',
);

describe('My Life Memory input connection server contract', () => {
  it('stores encrypted credentials owner-scoped without granting secret columns', () => {
    expect(migration).toContain('create table if not exists public.ai_mcp_connections');
    expect(migration).toContain('credential_ciphertext text not null');
    expect(migration).toContain('credential_iv text not null');
    expect(migration).toContain('using ((select auth.uid()) = user_id)');
    expect(migration).toContain('grant select (provider, status, server_version');
    expect(migration).not.toMatch(/grant select \([^)]*credential_ciphertext/);
    expect(migration).not.toMatch(/grant (?:insert|update|delete).*authenticated/);
  });

  it('accepts no client endpoint and never logs or returns the raw token', () => {
    expect(edge).toContain("env('MY_LIFE_MEMORY_MCP_URL')");
    expect(edge).toContain("env('MY_LIFE_MEMORY_CREDENTIAL_KEY')");
    expect(edge).toContain("env('MY_LIFE_MEMORY_MCP_MANIFEST_SHA256')");
    expect(edge).toContain('validateConnectionRequest');
    expect(edge).not.toContain('console.');
    expect(edge).not.toMatch(/jsonResponse\([^\n]*token/);
  });

  it('verifies initialize and tools/list before persistence', () => {
    expect(edge).toContain("method: 'initialize'");
    expect(edge).toContain("method: 'tools/list'");
    expect(edge).toContain('validateMlmHandshake');
    expect(edge).toContain('user_id=eq.${encodeURIComponent(userId)}');
    expect(edge).toContain('ai_mcp_connections?');
  });
});
