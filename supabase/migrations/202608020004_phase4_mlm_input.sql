-- Owner-scoped encrypted input connection for the fixed My Life Memory MCP.
create table if not exists public.ai_mcp_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'my_life_memory'
    check (provider = 'my_life_memory'),
  endpoint_id text not null default 'my-life-memory-official'
    check (endpoint_id = 'my-life-memory-official'),
  credential_ciphertext text not null check (length(credential_ciphertext) between 24 and 4096),
  credential_iv text not null check (length(credential_iv) between 16 and 64),
  credential_key_version integer not null default 1
    check (credential_key_version = 1),
  manifest_hash text not null check (manifest_hash ~ '^[a-f0-9]{64}$'),
  server_name text not null check (server_name = 'my-life-memory'),
  server_version text not null check (length(server_version) between 1 and 80),
  protocol_version text not null check (length(protocol_version) between 1 and 40),
  status text not null default 'connected'
    check (status in ('connected', 'unavailable')),
  last_error_code text check (last_error_code is null or length(last_error_code) between 1 and 80),
  connected_at timestamptz not null default now(),
  last_test_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.ai_mcp_connection_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ai_mcp_connection_events_user_time_idx
on public.ai_mcp_connection_events (user_id, created_at desc);

alter table public.ai_mcp_connections enable row level security;
alter table public.ai_mcp_connection_events enable row level security;
revoke all on public.ai_mcp_connections from public, anon, authenticated;
revoke all on public.ai_mcp_connection_events from public, anon, authenticated;

create policy "ai_mcp_connections_select_own"
on public.ai_mcp_connections for select to authenticated
using ((select auth.uid()) = user_id);

grant select (provider, status, server_version, protocol_version, manifest_hash, connected_at, last_test_at, last_error_code)
on public.ai_mcp_connections to authenticated;
grant all on public.ai_mcp_connections to service_role;
grant all on public.ai_mcp_connection_events to service_role;
grant usage, select on sequence public.ai_mcp_connection_events_id_seq to service_role;

create or replace function public.claim_ai_mcp_connection_quota(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'service role required' using errcode = '28000';
  end if;
  if p_user_id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtext('ai-mcp:' || p_user_id::text));
  delete from public.ai_mcp_connection_events
  where user_id = p_user_id and created_at < now() - interval '1 hour';
  select count(*) into v_count
  from public.ai_mcp_connection_events
  where user_id = p_user_id and created_at >= now() - interval '1 hour';
  if v_count >= 10 then return false; end if;
  insert into public.ai_mcp_connection_events (user_id) values (p_user_id);
  return true;
end;
$$;

revoke all on function public.claim_ai_mcp_connection_quota(uuid)
from public, anon, authenticated;
grant execute on function public.claim_ai_mcp_connection_quota(uuid)
to service_role;

