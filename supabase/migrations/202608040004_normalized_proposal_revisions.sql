-- Move MCP proposal compare-and-swap checks to the normalized dataset revision.
-- Historical migrations remain unchanged for auditability.

begin;

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

  select dataset_revision into v_remote_revision
  from public.emotion_settings
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

  select dataset_revision into v_remote_revision
  from public.emotion_settings
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

revoke all on function public.claim_mcp_proposal(uuid, bigint, text)
  from public, anon;
revoke all on function public.complete_mcp_proposal(uuid, uuid, bigint)
  from public, anon;
grant execute on function public.claim_mcp_proposal(uuid, bigint, text)
  to authenticated;
grant execute on function public.complete_mcp_proposal(uuid, uuid, bigint)
  to authenticated;

commit;
