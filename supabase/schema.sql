-- Minimal profile contract for the future Supabase connection.
-- The local demo UUID is display-only. A cloud profile must use the
-- authenticated user's auth.users.id.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null
    check (char_length(trim(display_name)) between 1 and 80)
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

grant select, insert, update on table public.profiles to authenticated;

-- Revisioned app snapshots. The write RPC in migrations/202608010001_app_states.sql
-- enforces compare-and-swap, idempotent request IDs, payload size, and Demo exclusion.
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
create policy "app_states_select_own" on public.app_states
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "app_states_insert_own" on public.app_states;
create policy "app_states_insert_own" on public.app_states
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "app_states_update_own" on public.app_states;
create policy "app_states_update_own" on public.app_states
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.app_states from public, anon, authenticated;
grant select on table public.app_states to authenticated;
