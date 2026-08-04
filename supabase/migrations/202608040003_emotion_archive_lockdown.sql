-- Freeze v1 app_states as a service-only, read-only migration archive.
-- This migration intentionally never updates, deletes, redacts, or truncates payload.

begin;

lock table public.app_states in share row exclusive mode;

drop policy if exists "app_states_select_own" on public.app_states;
drop policy if exists "app_states_insert_own" on public.app_states;
drop policy if exists "app_states_update_own" on public.app_states;

revoke all on table public.app_states
  from public, anon, authenticated;
grant select on table public.app_states to service_role;

create or replace function public.save_app_state(
  p_expected_revision bigint,
  p_request_id uuid,
  p_schema_version integer,
  p_payload jsonb
)
returns table(revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'legacy_snapshot_write_rejected'
    using errcode = '55000',
      hint = 'Use apply_emotion_mutations against normalized emotion storage v2.';
end;
$$;

revoke all on function public.save_app_state(bigint, uuid, integer, jsonb)
  from public, anon, authenticated, service_role;

commit;
