import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const storage = read('supabase/migrations/202608040001_normalized_emotion_storage_v2.sql');
const retention = read('supabase/migrations/202608040002_emotion_trash_retention.sql');
const lockdown = read('supabase/migrations/202608040003_emotion_archive_lockdown.sql');
const verifier = read('supabase/verify-normalized-emotion.sql');
const recovery = read('supabase/recover-normalized-emotion-for-user.sql');
const verifyScript = read('scripts/verify-normalized-emotion-migration.mjs');

const withoutComments = (source: string) => source
  .replace(/--.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('normalized emotion database migration safety', () => {
  it('creates every owner-scoped entity with RLS and read-only client grants', () => {
    const tables = [
      'emotion_settings',
      'emotion_preferences',
      'emotion_records',
      'emotion_conversations',
      'emotion_messages',
      'emotion_followups',
      'emotion_revisits',
      'emotion_entity_history',
    ];
    for (const table of tables) {
      expect(storage).toContain(`create table if not exists public.${table}`);
      expect(storage).toContain(`alter table public.${table} enable row level security`);
      expect(storage).toContain(
        `revoke all on public.${table} from public, anon, authenticated, service_role`,
      );
      expect(storage).toContain(`grant select on public.${table} to service_role`);
    }
    expect(storage).toContain('using ((select auth.uid()) = user_id)');
    expect(storage).not.toMatch(/grant\s+(insert|update|delete|all).*emotion_/i);
    expect(storage).toContain('emotion_settings_theme_palette_valid');
    expect(storage).toContain('emotion_preferences_followup_curve_valid');
  });

  it('applies one authenticated mutation batch atomically at one next revision', () => {
    const applyStart = storage.indexOf(
      'create or replace function public.apply_emotion_mutations',
    );
    const applyEnd = storage.indexOf(
      'create or replace function public.migrate_emotion_archive_user',
    );
    const apply = storage.slice(applyStart, applyEnd);

    expect(apply).toContain('v_user_id uuid := auth.uid()');
    expect(apply).toContain('for update');
    expect(apply).toContain('revision_conflict');
    expect(apply).toContain('jsonb_array_length(p_mutations) not between 1 and 500');
    expect(apply).toContain('v_next_revision := v_current_revision + 1');
    expect(apply.match(/dataset_revision\s*=\s*v_next_revision/g)).toHaveLength(1);
    expect(apply).toContain('Mutation payload contains sensitive fields');
    expect(apply).toContain('Parent conversation is missing');
    expect(apply).toContain('Terminal follow-up cannot be revived');
    expect(apply).toContain('Only one active follow-up is allowed');
    expect(storage).toContain('emotion_revisits_source_followup_idx');
    expect(apply).toContain("when 'message_soft_delete' then 80");
    expect(apply).toContain("when 'record_soft_delete' then 120");
  });

  it('locks and verifies every archive before marking it migrated', () => {
    const migration = storage.slice(storage.indexOf(
      'create or replace function public.migrate_emotion_archive_user',
    ));
    expect(storage.trimStart()).toMatch(/^--[\s\S]*?begin;/i);
    expect(storage).toContain('lock table public.app_states in share row exclusive mode');
    expect(migration).toContain('Future emotion schema cannot be migrated');
    expect(migration).toContain('Demo emotion archive cannot be migrated');
    expect(migration).toContain('Duplicate moment or note ID');
    expect(migration).toContain('Missing moment-note pair');
    expect(migration).toContain('Shared moment-note fields diverge');
    expect(migration).toContain("coalesce(message.value ->> 'deliveryState', '') <> 'pending'");
    expect(migration).toContain('v_source_checksum := md5(v_source_semantic::text)');
    expect(migration).toContain('v_new_checksum := md5(v_new_semantic::text)');
    expect(migration).toContain('Normalized emotion migration verification failed');
    expect(migration.indexOf('Normalized emotion migration verification failed'))
      .toBeLessThan(migration.indexOf('migration_verified_at = now()'));
    expect(migration).toContain('perform public.migrate_emotion_archive_user(v_user_id)');
    expect(storage.trimEnd()).toMatch(/commit;$/i);
  });

  it('never mutates or removes the immutable archive payload', () => {
    const combined = withoutComments([storage, retention, lockdown, recovery].join('\n'));
    expect(combined).not.toMatch(/update\s+public\.app_states/i);
    expect(combined).not.toMatch(/delete\s+from\s+public\.app_states/i);
    expect(combined).not.toMatch(/truncate\s+(table\s+)?public\.app_states/i);
    expect(combined).not.toMatch(/drop\s+table\s+(if\s+exists\s+)?public\.app_states/i);
    expect(combined).not.toMatch(/set\s+payload\s*=/i);
    expect(lockdown).toContain("raise exception 'legacy_snapshot_write_rejected'");
    expect(lockdown).toContain('grant select on table public.app_states to service_role');
    expect(lockdown).toContain('from public, anon, authenticated, service_role');
  });

  it('purges only propagated seven-day tombstones under the revision-row lock', () => {
    expect(retention).toContain("now() - interval '7 days'");
    expect(retention).toContain('from public.emotion_settings settings');
    expect(retention).toContain('for update');
    expect(retention.indexOf('delete from public.emotion_messages'))
      .toBeLessThan(retention.indexOf('delete from public.emotion_conversations'));
    expect(retention.indexOf('delete from public.emotion_revisits'))
      .toBeLessThan(retention.indexOf('delete from public.emotion_records'));
    expect(retention).toContain('offset 20');
    expect(retention).toContain("'datasetRevisionChanged', false");
    expect(retention).not.toMatch(/dataset_revision\s*=/);
    expect(retention).toContain('from public, anon, authenticated');
    expect(retention).toContain("where jobname = $1");
    expect(retention).toContain('pg_cron is unavailable');
    expect(retention).not.toMatch(/media|avatar/i);
  });

  it('provides read-only verification and explicit same-user recovery', () => {
    const requiredOutput = [
      'archive_user_count', 'normalized_user_count', 'record_count',
      'conversation_count', 'message_count', 'followup_count', 'revisit_count',
      'ids_match', 'sort_order_match', 'semantic_checksum_match',
      'migration_verified_at', 'data_model_version', 'orphan_count',
      'duplicate_count', 'future_schema_count',
    ];
    for (const value of requiredOutput) expect(verifier).toContain(value);
    expect(withoutComments(verifier)).not.toMatch(
      /\b(update|insert|delete|truncate|alter|drop|create)\b\s+(table|from|into|public\.)/i,
    );
    expect(verifier).not.toMatch(/select\s+[^;]*archive\.payload\s*(,|as|from)/i);
    expect(recovery).toContain('v_user_id uuid := null');
    expect(recovery).toContain('where archive.user_id = v_user_id');
    expect(recovery).toContain('public.migrate_emotion_archive_user(v_user_id)');
    expect(recovery).not.toMatch(/insert\s+into\s+public\.app_states/i);
    expect(verifyScript).toContain("process.env.SUPABASE_DB_URL");
    expect(verifyScript).toContain("process.argv.includes('--check-file')");
    expect(verifyScript).not.toContain('console.log(databaseUrl)');
  });
});
