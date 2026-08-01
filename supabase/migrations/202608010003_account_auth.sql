-- Account-name authentication support. The browser never asks for or displays
-- an email address; registration is performed by a tightly scoped Edge Function.
create table if not exists public.account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_id text not null unique
    check (account_id ~ '^[a-z0-9._-]{3,24}$'),
  created_at timestamptz not null default now()
);

alter table public.account_profiles enable row level security;
revoke all on table public.account_profiles from public, anon, authenticated;
grant select on table public.account_profiles to authenticated;

drop policy if exists "account_profiles_select_own" on public.account_profiles;
create policy "account_profiles_select_own"
on public.account_profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create table if not exists public.registration_rate_limits (
  bucket_hash text not null check (char_length(bucket_hash) = 64),
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (bucket_hash, window_start)
);

alter table public.registration_rate_limits enable row level security;
revoke all on table public.registration_rate_limits from public, anon, authenticated;

create or replace function public.claim_registration_quota(
  p_bucket_hash text,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_count integer;
begin
  if p_bucket_hash !~ '^[a-f0-9]{64}$' or p_limit < 1 or p_limit > 50 then
    raise exception 'invalid quota input' using errcode = '22023';
  end if;

  insert into public.registration_rate_limits(
    bucket_hash,
    window_start,
    request_count
  )
  values (p_bucket_hash, v_window, 1)
  on conflict (bucket_hash, window_start)
  do update set request_count = public.registration_rate_limits.request_count + 1
    where public.registration_rate_limits.request_count < p_limit
  returning request_count into v_count;

  delete from public.registration_rate_limits
  where window_start < v_window - interval '48 hours';

  return v_count is not null and v_count <= p_limit;
end;
$$;

revoke all on function public.claim_registration_quota(text, integer)
from public, anon, authenticated;
grant execute on function public.claim_registration_quota(text, integer)
to service_role;
