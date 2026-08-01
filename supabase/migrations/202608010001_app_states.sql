-- Owner-only, revisioned snapshots for My Emotion Map.
-- Deploy only to the dedicated My Emotion Map Supabase project.

create table if not exists public.app_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null check (schema_version between 3 and 100),
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null check (payload ->> 'dataMode' = 'real'),
  last_request_id uuid not null,
  updated_at timestamptz not null default now()
);

alter table public.app_states enable row level security;

drop policy if exists "app_states_select_own" on public.app_states;
create policy "app_states_select_own"
on public.app_states for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "app_states_insert_own" on public.app_states;
create policy "app_states_insert_own"
on public.app_states for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "app_states_update_own" on public.app_states;
create policy "app_states_update_own"
on public.app_states for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.app_states from public, anon, authenticated;
grant select on table public.app_states to authenticated;

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
declare
  v_user_id uuid := auth.uid();
  v_current public.app_states%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_schema_version < 3 or p_schema_version > 100 then
    raise exception 'unsupported schema version' using errcode = '22023';
  end if;
  if p_payload ->> 'dataMode' is distinct from 'real' then
    raise exception 'demo snapshots cannot be uploaded' using errcode = '22023';
  end if;
  if octet_length(p_payload::text) > 2000000 then
    raise exception 'snapshot exceeds size limit' using errcode = '22001';
  end if;

  select * into v_current
  from public.app_states
  where user_id = v_user_id
  for update;

  if found then
    if v_current.last_request_id = p_request_id then
      return query select v_current.revision, v_current.updated_at;
      return;
    end if;
    if v_current.revision <> p_expected_revision then
      raise exception 'revision conflict' using errcode = '40001';
    end if;
    update public.app_states
    set schema_version = p_schema_version,
        payload = p_payload,
        revision = public.app_states.revision + 1,
        last_request_id = p_request_id,
        updated_at = now()
    where user_id = v_user_id
    returning public.app_states.revision, public.app_states.updated_at
      into revision, updated_at;
    return next;
    return;
  end if;

  if p_expected_revision <> 0 then
    raise exception 'revision conflict' using errcode = '40001';
  end if;
  insert into public.app_states (
    user_id, schema_version, revision, payload, last_request_id
  ) values (
    v_user_id, p_schema_version, 1, p_payload, p_request_id
  )
  returning public.app_states.revision, public.app_states.updated_at
    into revision, updated_at;
  return next;
end;
$$;

revoke all on function public.save_app_state(bigint, uuid, integer, jsonb)
from public, anon;
grant execute on function public.save_app_state(bigint, uuid, integer, jsonb)
to authenticated;
