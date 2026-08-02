-- Scoped, revocable MCP access for the dedicated My Emotion Map project.
create extension if not exists pgcrypto;

create table if not exists public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  scopes text[] not null default array['records:read']::text[],
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  check (scopes <@ array['records:read', 'proposals:write', 'coordinates:rounded']::text[])
);

create table if not exists public.mcp_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_id uuid not null references public.mcp_tokens(id) on delete cascade,
  client_request_id text not null check (length(client_request_id) between 1 and 120),
  tool_name text not null check (length(tool_name) between 1 and 120),
  payload jsonb not null,
  status text not null default 'queued'
    check (status in ('queued', 'shown', 'accepted', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  unique (token_id, client_request_id)
);

create table if not exists public.mcp_request_events (
  id bigint generated always as identity primary key,
  token_id uuid not null references public.mcp_tokens(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists mcp_request_events_token_time_idx
on public.mcp_request_events (token_id, created_at desc);

alter table public.mcp_tokens enable row level security;
alter table public.mcp_proposals enable row level security;
alter table public.mcp_request_events enable row level security;

revoke all on public.mcp_tokens from public, anon, authenticated;
revoke all on public.mcp_proposals from public, anon, authenticated;
revoke all on public.mcp_request_events from public, anon, authenticated;

create policy "mcp_tokens_select_own"
on public.mcp_tokens for select to authenticated
using ((select auth.uid()) = user_id);

create policy "mcp_proposals_select_own"
on public.mcp_proposals for select to authenticated
using ((select auth.uid()) = user_id);

grant select (id, scopes, expires_at, revoked_at, created_at, last_used_at)
on public.mcp_tokens to authenticated;
grant select, update (status) on public.mcp_proposals to authenticated;

create or replace function public.issue_mcp_token(
  p_kind text,
  p_ttl_hours integer default 24
)
returns table(token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text;
  v_scopes text[];
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_ttl_hours not in (1, 24, 720) then
    raise exception 'invalid token lifetime' using errcode = '22023';
  end if;
  v_scopes := case p_kind
    when 'input' then array['records:read']::text[]
    when 'output' then array['proposals:write']::text[]
    else null
  end;
  if v_scopes is null then
    raise exception 'invalid token kind' using errcode = '22023';
  end if;
  v_token := 'mem_' || encode(gen_random_bytes(32), 'hex');
  insert into public.mcp_tokens (user_id, token_hash, scopes, expires_at)
  values (
    v_user_id,
    encode(digest(v_token, 'sha256'), 'hex'),
    v_scopes,
    now() + make_interval(hours => p_ttl_hours)
  );
  return query select v_token, now() + make_interval(hours => p_ttl_hours);
end;
$$;

create or replace function public.revoke_all_mcp_tokens()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  update public.mcp_tokens
  set revoked_at = coalesce(revoked_at, now())
  where user_id = auth.uid() and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.claim_mcp_quota(p_token_id uuid)
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
  perform pg_advisory_xact_lock(hashtext(p_token_id::text));
  delete from public.mcp_request_events
  where token_id = p_token_id and created_at < now() - interval '1 hour';
  select count(*) into v_count
  from public.mcp_request_events
  where token_id = p_token_id and created_at >= now() - interval '1 hour';
  if v_count >= 120 then return false; end if;
  insert into public.mcp_request_events (token_id) values (p_token_id);
  return true;
end;
$$;

revoke all on function public.issue_mcp_token(text, integer) from public, anon;
revoke all on function public.revoke_all_mcp_tokens() from public, anon;
grant execute on function public.issue_mcp_token(text, integer) to authenticated;
grant execute on function public.revoke_all_mcp_tokens() to authenticated;
revoke all on function public.claim_mcp_quota(uuid) from public, anon, authenticated;
grant execute on function public.claim_mcp_quota(uuid) to service_role;

create table if not exists public.shortcut_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  resting_min integer not null check (resting_min between 35 and 180),
  resting_max integer not null check (resting_max between 40 and 220 and resting_max > resting_min),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.shortcut_request_events (
  id bigint generated always as identity primary key,
  token_id uuid not null references public.shortcut_tokens(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists shortcut_request_events_token_time_idx
on public.shortcut_request_events (token_id, created_at desc);

create table if not exists public.shortcut_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_id uuid not null references public.shortcut_tokens(id) on delete cascade,
  event_id text not null check (length(event_id) between 1 and 180),
  sampled_at timestamptz not null,
  time_zone text,
  context text not null check (context in ('resting', 'workout', 'unknown')),
  samples jsonb not null,
  median_bpm integer not null check (median_bpm between 20 and 260),
  is_test boolean not null default false,
  low_signal boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'dismissed', 'consumed')),
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

alter table public.shortcut_tokens enable row level security;
alter table public.shortcut_request_events enable row level security;
alter table public.shortcut_observations enable row level security;
revoke all on public.shortcut_tokens from public, anon, authenticated;
revoke all on public.shortcut_request_events from public, anon, authenticated;
revoke all on public.shortcut_observations from public, anon, authenticated;

create policy "shortcut_tokens_select_own"
on public.shortcut_tokens for select to authenticated
using ((select auth.uid()) = user_id);
create policy "shortcut_observations_select_own"
on public.shortcut_observations for select to authenticated
using ((select auth.uid()) = user_id);
create policy "shortcut_observations_update_own"
on public.shortcut_observations for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select (id, expires_at, revoked_at, created_at) on public.shortcut_tokens to authenticated;
grant select on public.shortcut_observations to authenticated;
grant update (status) on public.shortcut_observations to authenticated;

create or replace function public.issue_shortcut_pairing(
  p_resting_min integer,
  p_resting_max integer
)
returns table(token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_resting_min < 35 or p_resting_max > 220 or p_resting_min >= p_resting_max then
    raise exception 'invalid observation range' using errcode = '22023';
  end if;
  v_token := 'mes_' || encode(gen_random_bytes(32), 'hex');
  insert into public.shortcut_tokens (
    user_id, token_hash, resting_min, resting_max, expires_at
  ) values (
    v_user_id, encode(digest(v_token, 'sha256'), 'hex'),
    p_resting_min, p_resting_max, now() + interval '30 days'
  );
  return query select v_token, now() + interval '30 days';
end;
$$;

create or replace function public.revoke_all_shortcut_tokens()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  update public.shortcut_tokens
  set revoked_at = coalesce(revoked_at, now())
  where user_id = auth.uid() and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.claim_shortcut_quota(p_token_id uuid)
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
  perform pg_advisory_xact_lock(hashtext(p_token_id::text));
  delete from public.shortcut_request_events
  where token_id = p_token_id and created_at < now() - interval '1 hour';
  select count(*) into v_count
  from public.shortcut_request_events
  where token_id = p_token_id and created_at >= now() - interval '1 hour';
  if v_count >= 60 then return false; end if;
  insert into public.shortcut_request_events (token_id) values (p_token_id);
  return true;
end;
$$;

revoke all on function public.issue_shortcut_pairing(integer, integer) from public, anon;
revoke all on function public.revoke_all_shortcut_tokens() from public, anon;
grant execute on function public.issue_shortcut_pairing(integer, integer) to authenticated;
grant execute on function public.revoke_all_shortcut_tokens() to authenticated;
revoke all on function public.claim_shortcut_quota(uuid) from public, anon, authenticated;
grant execute on function public.claim_shortcut_quota(uuid) to service_role;
