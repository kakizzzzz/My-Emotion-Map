import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/202608040004_normalized_proposal_revisions.sql',
  'utf8',
);

describe('normalized MCP proposal revision migration', () => {
  it('claims and completes proposals against dataset_revision', () => {
    expect(migration.match(/select dataset_revision into v_remote_revision/g))
      .toHaveLength(2);
    expect(migration).toContain('from public.emotion_settings');
    expect(migration).not.toContain('public.app_states');
    expect(migration).toContain('v_remote_revision <> p_expected_revision');
    expect(migration).toContain('v_remote_revision is distinct from p_applied_revision');
  });
});
