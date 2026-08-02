import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readServer = readFileSync(
  resolve(process.cwd(), 'supabase/functions/emotion-map-mcp/index.ts'),
  'utf8',
);
const actionServer = readFileSync(
  resolve(process.cwd(), 'supabase/functions/emotion-map-action-mcp/index.ts'),
  'utf8',
);
const actionQueue = readFileSync(
  resolve(process.cwd(), 'supabase/functions/_shared/emotionMapMcpActions.ts'),
  'utf8',
);
const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/202608020005_phase5_output_mcp.sql'),
  'utf8',
);

describe('Emotion Map MCP server separation contract', () => {
  it('keeps proposals and broken deep links out of the read server', () => {
    expect(readServer).not.toMatch(/propose_|open_record/);
    expect(readServer).toContain('listEmotionMapReadTools');
    expect(readServer).toContain('touchMcpToken');
  });

  it('exposes proposals only through the action server', () => {
    expect(actionServer).toContain('EMOTION_MAP_ACTION_TOOLS');
    expect(actionServer).toContain("MCP_ACTION_SCOPE");
    expect(actionQueue).toContain('requiresUserConfirmation');
  });

  it('issues default output tokens as read-only and action tokens explicitly', () => {
    expect(migration).toMatch(/when 'output' then array\['records:read'\]/);
    expect(migration).toMatch(/when 'action' then array\['proposals:write'\]/);
    expect(migration).toContain('revoke execute on function public.revoke_all_mcp_tokens() from authenticated');
    expect(migration).toContain('create or replace function public.revoke_mcp_tokens');
  });
});
