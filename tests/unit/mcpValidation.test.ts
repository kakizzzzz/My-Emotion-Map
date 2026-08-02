import { describe, expect, it } from 'vitest';
import {
  canCallMcpTool,
  isMcpOwner,
} from '../../supabase/functions/_shared/mcpValidation';

describe('MCP authorization boundary', () => {
  it('keeps read and proposal scopes separate', () => {
    expect(canCallMcpTool(['records:read'], 'emotion_map.search_records')).toBe(true);
    expect(canCallMcpTool(['records:read'], 'emotion_map.propose_create_draft')).toBe(false);
    expect(canCallMcpTool(['proposals:write'], 'emotion_map.propose_create_draft')).toBe(true);
    expect(canCallMcpTool(['proposals:write'], 'emotion_map.search_records')).toBe(false);
  });

  it('rejects rows belonging to another user', () => {
    expect(isMcpOwner('user-a', 'user-a')).toBe(true);
    expect(isMcpOwner('user-a', 'user-b')).toBe(false);
    expect(isMcpOwner('user-a', null)).toBe(false);
  });
});
