-- Recoverable, idempotent proposal application for the existing MCP surface.
alter table public.mcp_proposals
  add column if not exists operation_id uuid not null default gen_random_uuid(),
  add column if not exists created_against_revision bigint,
  add column if not exists target_note_fingerprint text,
  add column if not exists accepted_at timestamptz,
  add column if not exists applied_at timestamptz,
  add column if not exists applied_revision bigint,
  add column if not exists failure_code text;

update public.mcp_proposals
set status = 'applied',
    applied_at = coalesce(applied_at, now())
where status = 'accepted';

alter table public.mcp_proposals
  drop constraint if exists mcp_proposals_status_check;

alter table public.mcp_proposals
  add constraint mcp_proposals_status_check
  check (status in (
    'queued', 'shown', 'accepting', 'applied', 'failed', 'rejected', 'expired'
  ));

alter table public.mcp_proposals
  drop constraint if exists mcp_proposals_target_fingerprint_check;

alter table public.mcp_proposals
  add constraint mcp_proposals_target_fingerprint_check
  check (
    target_note_fingerprint is null or
    target_note_fingerprint ~ '^[a-f0-9]{64}$'
  );

revoke update (status) on public.mcp_proposals from authenticated;

create or replace function public.claim_mcp_proposal(
  p_proposal_id uuid,
  p_expected_revision bigint,
  p_target_note_fingerprint text default null
)
returns table(status text, operation_id uuid)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_proposal public.mcp_proposals%rowtype;
  v_remote_revision bigint;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_proposal
  from public.mcp_proposals
  where id = p_proposal_id and user_id = v_user_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if v_proposal.status = 'applied' then
    return query select 'already_applied'::text, v_proposal.operation_id;
    return;
  end if;
  if v_proposal.status = 'accepting' then
    return query select 'accepting'::text, v_proposal.operation_id;
    return;
  end if;
  if v_proposal.status <> 'queued' then
    return query select 'state_conflict'::text, null::uuid;
    return;
  end if;

  select revision into v_remote_revision
  from public.app_states
  where user_id = v_user_id;
  v_remote_revision := coalesce(v_remote_revision, 0);

  if v_proposal.created_against_revision is null or
     v_proposal.created_against_revision <> p_expected_revision or
     v_remote_revision <> p_expected_revision or
     v_proposal.target_note_fingerprint is distinct from p_target_note_fingerprint then
    return query select 'stale'::text, null::uuid;
    return;
  end if;

  update public.mcp_proposals
  set status = 'accepting',
      accepted_at = now(),
      failure_code = null
  where id = v_proposal.id;

  return query select 'accepting'::text, v_proposal.operation_id;
end;
$$;

create or replace function public.complete_mcp_proposal(
  p_proposal_id uuid,
  p_operation_id uuid,
  p_applied_revision bigint
)
returns table(status text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_proposal public.mcp_proposals%rowtype;
  v_remote_revision bigint;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_proposal
  from public.mcp_proposals
  where id = p_proposal_id and user_id = v_user_id
  for update;

  if not found then
    return query select 'not_found'::text;
    return;
  end if;
  if v_proposal.status = 'applied' and v_proposal.operation_id = p_operation_id then
    return query select 'already_applied'::text;
    return;
  end if;
  if v_proposal.status <> 'accepting' or v_proposal.operation_id <> p_operation_id then
    return query select 'state_conflict'::text;
    return;
  end if;

  select revision into v_remote_revision
  from public.app_states
  where user_id = v_user_id;
  if v_remote_revision is distinct from p_applied_revision then
    return query select 'not_synced'::text;
    return;
  end if;

  update public.mcp_proposals
  set status = 'applied',
      applied_at = now(),
      applied_revision = p_applied_revision,
      failure_code = null
  where id = v_proposal.id;
  return query select 'applied'::text;
end;
$$;

create or replace function public.fail_mcp_proposal(
  p_proposal_id uuid,
  p_operation_id uuid,
  p_failure_code text
)
returns table(status text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  update public.mcp_proposals
  set status = 'failed',
      failure_code = left(coalesce(p_failure_code, 'local_apply_failed'), 80)
  where id = p_proposal_id
    and user_id = v_user_id
    and operation_id = p_operation_id
    and status = 'accepting';
  get diagnostics v_updated = row_count;
  return query select case when v_updated = 1 then 'failed' else 'state_conflict' end::text;
end;
$$;

create or replace function public.reject_mcp_proposal(p_proposal_id uuid)
returns table(status text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  update public.mcp_proposals
  set status = 'rejected'
  where id = p_proposal_id
    and user_id = v_user_id
    and status = 'queued';
  get diagnostics v_updated = row_count;
  return query select case when v_updated = 1 then 'rejected' else 'state_conflict' end::text;
end;
$$;

revoke all on function public.claim_mcp_proposal(uuid, bigint, text) from public;
revoke all on function public.complete_mcp_proposal(uuid, uuid, bigint) from public;
revoke all on function public.fail_mcp_proposal(uuid, uuid, text) from public;
revoke all on function public.reject_mcp_proposal(uuid) from public;
grant execute on function public.claim_mcp_proposal(uuid, bigint, text) to authenticated;
grant execute on function public.complete_mcp_proposal(uuid, uuid, bigint) to authenticated;
grant execute on function public.fail_mcp_proposal(uuid, uuid, text) to authenticated;
grant execute on function public.reject_mcp_proposal(uuid) to authenticated;
