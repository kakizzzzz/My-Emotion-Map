-- Phase 3: deterministic heart-v3 evaluation, episode merging and resumable delivery.

alter table public.shortcut_tokens
  add column if not exists algorithm_version text not null default 'heart-v3',
  add column if not exists shortcut_version text not null default 'shortcut-v3',
  add column if not exists single_sample_enabled boolean not null default false,
  add column if not exists workout_policy text not null default 'suppress',
  add column if not exists unknown_policy text not null default 'suppress',
  add column if not exists cooldown_minutes integer not null default 30,
  add column if not exists last_received_at timestamptz,
  add column if not exists last_test_at timestamptz;

-- Earlier tokens do not carry the v3 policy snapshot. Re-pairing is safer than
-- silently changing how an installed Shortcut is interpreted.
update public.shortcut_tokens
set revoked_at = coalesce(revoked_at, now())
where revoked_at is null;

alter table public.shortcut_tokens
  drop constraint if exists shortcut_tokens_algorithm_version_check,
  drop constraint if exists shortcut_tokens_shortcut_version_check,
  drop constraint if exists shortcut_tokens_workout_policy_check,
  drop constraint if exists shortcut_tokens_unknown_policy_check,
  drop constraint if exists shortcut_tokens_cooldown_minutes_check,
  add constraint shortcut_tokens_algorithm_version_check
    check (algorithm_version = 'heart-v3'),
  add constraint shortcut_tokens_shortcut_version_check
    check (shortcut_version = 'shortcut-v3'),
  add constraint shortcut_tokens_workout_policy_check
    check (workout_policy in ('suppress', 'post_workout_review')),
  add constraint shortcut_tokens_unknown_policy_check
    check (unknown_policy in ('suppress', 'strict_review')),
  add constraint shortcut_tokens_cooldown_minutes_check
    check (cooldown_minutes between 5 and 180);

grant select (
  id, resting_min, resting_max, expires_at, revoked_at, created_at,
  algorithm_version, shortcut_version, single_sample_enabled,
  workout_policy, unknown_policy, cooldown_minutes,
  last_received_at, last_test_at
) on public.shortcut_tokens to authenticated;

drop function if exists public.issue_shortcut_pairing(integer, integer);

create or replace function public.issue_shortcut_pairing(
  p_resting_min integer,
  p_resting_max integer,
  p_single_sample_enabled boolean,
  p_workout_policy text,
  p_unknown_policy text,
  p_cooldown_minutes integer
)
returns table(
  token text,
  expires_at timestamptz,
  shortcut_version text,
  algorithm_version text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text;
  v_expires_at timestamptz := now() + interval '30 days';
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_resting_min < 35 or p_resting_max > 220 or
     p_resting_min >= p_resting_max or
     p_workout_policy not in ('suppress', 'post_workout_review') or
     p_unknown_policy not in ('suppress', 'strict_review') or
     p_cooldown_minutes not between 5 and 180 then
    raise exception 'invalid observation policy' using errcode = '22023';
  end if;
  v_token := 'mes_' || encode(gen_random_bytes(32), 'hex');
  update public.shortcut_tokens
  set revoked_at = coalesce(revoked_at, now())
  where user_id = v_user_id and revoked_at is null;
  insert into public.shortcut_tokens (
    user_id, token_hash, resting_min, resting_max, expires_at,
    algorithm_version, shortcut_version, single_sample_enabled,
    workout_policy, unknown_policy, cooldown_minutes
  ) values (
    v_user_id, encode(digest(v_token, 'sha256'), 'hex'),
    p_resting_min, p_resting_max, v_expires_at,
    'heart-v3', 'shortcut-v3', p_single_sample_enabled,
    p_workout_policy, p_unknown_policy, p_cooldown_minutes
  );
  return query select v_token, v_expires_at, 'shortcut-v3', 'heart-v3';
end;
$$;

revoke all on function public.issue_shortcut_pairing(
  integer, integer, boolean, text, text, integer
) from public, anon;
grant execute on function public.issue_shortcut_pairing(
  integer, integer, boolean, text, text, integer
) to authenticated;

alter table public.shortcut_observations
  add column if not exists side text,
  add column if not exists episode_key text,
  add column if not exists last_sample_at timestamptz,
  add column if not exists repeat_count integer not null default 1,
  add column if not exists delivery_ack_at timestamptz;

update public.shortcut_observations
set last_sample_at = sampled_at
where last_sample_at is null;

alter table public.shortcut_observations
  alter column last_sample_at set not null,
  drop constraint if exists shortcut_observations_status_check,
  drop constraint if exists shortcut_observations_side_check,
  drop constraint if exists shortcut_observations_repeat_count_check,
  drop constraint if exists shortcut_observations_decision_reason_check,
  add constraint shortcut_observations_status_check
    check (status in ('pending', 'delivered', 'dismissed', 'consumed')),
  add constraint shortcut_observations_side_check
    check (side is null or side in ('high', 'low')),
  add constraint shortcut_observations_repeat_count_check
    check (repeat_count between 1 and 1000000),
  add constraint shortcut_observations_decision_reason_check
    check (decision_reason in (
      'pending_test', 'outside_range', 'outside_range_single_sample',
      'post_workout_review', 'unknown_strict_review',
      'outside_resting_range', 'low_signal_review',
      'non_resting_review', 'test_event', 'legacy_review'
    ));

create index if not exists shortcut_observations_delivery_cursor_idx
on public.shortcut_observations (user_id, created_at, id)
where status in ('pending', 'delivered');

create index if not exists shortcut_observations_episode_idx
on public.shortcut_observations (user_id, token_id, episode_key, last_sample_at desc)
where status in ('pending', 'delivered') and is_test = false;

create table if not exists public.shortcut_observation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_id uuid not null references public.shortcut_tokens(id) on delete cascade,
  event_id text not null check (length(event_id) between 1 and 180),
  observation_id uuid not null references public.shortcut_observations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

alter table public.shortcut_observation_events enable row level security;
revoke all on public.shortcut_observation_events from public, anon, authenticated;

create or replace function public.record_shortcut_observation_v3(
  p_user_id uuid,
  p_token_id uuid,
  p_event_id text,
  p_sampled_at timestamptz,
  p_time_zone text,
  p_context text,
  p_samples jsonb,
  p_median_bpm integer,
  p_is_test boolean,
  p_low_signal boolean,
  p_decision_reason text,
  p_threshold_snapshot jsonb,
  p_signal_level text,
  p_side text,
  p_cooldown_minutes integer
)
returns table(result text, observation_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_observation_id uuid;
  v_episode_key text;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'service role required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.shortcut_tokens
    where id = p_token_id and user_id = p_user_id and revoked_at is null
      and expires_at > now() and algorithm_version = 'heart-v3'
      and cooldown_minutes = p_cooldown_minutes
  ) then
    raise exception 'invalid shortcut token' using errcode = '28000';
  end if;
  if p_context not in ('resting', 'workout', 'unknown') or
     p_median_bpm not between 20 and 260 or
     p_decision_reason not in (
       'pending_test', 'outside_range', 'outside_range_single_sample',
       'post_workout_review', 'unknown_strict_review'
     ) or
     p_signal_level not in ('standard', 'low') or
     (not p_is_test and (p_side is null or p_side not in ('high', 'low'))) or
     (p_is_test and p_decision_reason <> 'pending_test') or
     (not p_is_test and p_decision_reason = 'pending_test') or
     jsonb_typeof(p_samples) <> 'array' or
     jsonb_array_length(p_samples) not between 1 and 3 or
     jsonb_typeof(p_threshold_snapshot) <> 'object' or
     p_cooldown_minutes not between 5 and 180 then
    raise exception 'invalid observation' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_event_id));
  select event.observation_id into v_observation_id
  from public.shortcut_observation_events as event
  where event.user_id = p_user_id and event.event_id = p_event_id;
  if v_observation_id is not null then
    return query select 'duplicate'::text, v_observation_id;
    return;
  end if;
  select observation.id into v_observation_id
  from public.shortcut_observations as observation
  where observation.user_id = p_user_id and observation.event_id = p_event_id;
  if v_observation_id is not null then
    insert into public.shortcut_observation_events (
      user_id, token_id, event_id, observation_id
    ) values (p_user_id, p_token_id, p_event_id, v_observation_id)
    on conflict (user_id, event_id) do nothing;
    return query select 'duplicate'::text, v_observation_id;
    return;
  end if;

  v_episode_key := case when p_is_test then null else
    p_user_id::text || ':' || p_token_id::text || ':' || p_side || ':' || p_context
  end;
  if v_episode_key is not null then
    perform pg_advisory_xact_lock(hashtext(v_episode_key));
    select observation.id into v_observation_id
    from public.shortcut_observations as observation
    where observation.user_id = p_user_id
      and observation.token_id = p_token_id
      and observation.episode_key = v_episode_key
      and observation.is_test = false
      and observation.status in ('pending', 'delivered')
      and p_sampled_at >= observation.last_sample_at
      and p_sampled_at - observation.last_sample_at <=
        make_interval(mins => p_cooldown_minutes)
    order by observation.last_sample_at desc
    limit 1
    for update;
  end if;

  if v_observation_id is not null then
    update public.shortcut_observations
    set sampled_at = p_sampled_at,
        last_sample_at = p_sampled_at,
        time_zone = nullif(left(coalesce(p_time_zone, ''), 100), ''),
        context = p_context,
        samples = p_samples,
        median_bpm = p_median_bpm,
        low_signal = p_low_signal,
        decision_reason = p_decision_reason,
        threshold_snapshot = p_threshold_snapshot,
        algorithm_version = 'heart-v3',
        signal_level = p_signal_level,
        side = p_side,
        repeat_count = repeat_count + 1,
        status = 'pending',
        delivery_ack_at = null
    where id = v_observation_id;
    insert into public.shortcut_observation_events (
      user_id, token_id, event_id, observation_id
    ) values (p_user_id, p_token_id, p_event_id, v_observation_id);
    update public.shortcut_tokens
    set last_received_at = greatest(coalesce(last_received_at, p_sampled_at), p_sampled_at)
    where id = p_token_id;
    return query select 'merged'::text, v_observation_id;
    return;
  end if;

  insert into public.shortcut_observations (
    user_id, token_id, event_id, sampled_at, last_sample_at,
    time_zone, context, samples, median_bpm, is_test, low_signal,
    decision_reason, threshold_snapshot, algorithm_version, signal_level,
    side, episode_key, repeat_count, status
  ) values (
    p_user_id, p_token_id, p_event_id, p_sampled_at, p_sampled_at,
    nullif(left(coalesce(p_time_zone, ''), 100), ''), p_context,
    p_samples, p_median_bpm, p_is_test, p_low_signal,
    p_decision_reason, p_threshold_snapshot, 'heart-v3', p_signal_level,
    p_side, v_episode_key, 1, 'pending'
  ) returning id into v_observation_id;
  insert into public.shortcut_observation_events (
    user_id, token_id, event_id, observation_id
  ) values (p_user_id, p_token_id, p_event_id, v_observation_id);
  update public.shortcut_tokens
  set last_received_at = greatest(coalesce(last_received_at, p_sampled_at), p_sampled_at),
      last_test_at = case when p_is_test then now() else last_test_at end
  where id = p_token_id;
  return query select 'accepted'::text, v_observation_id;
end;
$$;

revoke all on function public.record_shortcut_observation_v3(
  uuid, uuid, text, timestamptz, text, text, jsonb, integer, boolean,
  boolean, text, jsonb, text, text, integer
) from public, anon, authenticated;
grant execute on function public.record_shortcut_observation_v3(
  uuid, uuid, text, timestamptz, text, text, jsonb, integer, boolean,
  boolean, text, jsonb, text, text, integer
) to service_role;

create or replace function public.list_shortcut_observations_page(
  p_after_created_at timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 20
)
returns table(
  id uuid,
  event_id text,
  sampled_at timestamptz,
  context text,
  samples jsonb,
  median_bpm integer,
  is_test boolean,
  low_signal boolean,
  decision_reason text,
  threshold_snapshot jsonb,
  algorithm_version text,
  signal_level text,
  repeat_count integer,
  created_at timestamptz,
  status text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    observation.id, observation.event_id, observation.sampled_at,
    observation.context, observation.samples, observation.median_bpm,
    observation.is_test, observation.low_signal, observation.decision_reason,
    observation.threshold_snapshot, observation.algorithm_version,
    observation.signal_level, observation.repeat_count,
    observation.created_at, observation.status
  from public.shortcut_observations as observation
  where observation.user_id = auth.uid()
    and observation.status in ('pending', 'delivered')
    and (
      p_after_created_at is null or
      (observation.created_at, observation.id) > (p_after_created_at, p_after_id)
    )
  order by observation.created_at, observation.id
  limit least(greatest(p_limit, 1), 50)
$$;

create or replace function public.ack_shortcut_observations(p_ids uuid[])
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
  update public.shortcut_observations
  set status = 'delivered', delivery_ack_at = coalesce(delivery_ack_at, now())
  where user_id = auth.uid() and id = any(p_ids) and status = 'pending';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.list_shortcut_observations_page(
  timestamptz, uuid, integer
) from public, anon;
revoke all on function public.ack_shortcut_observations(uuid[]) from public, anon;
grant execute on function public.list_shortcut_observations_page(
  timestamptz, uuid, integer
) to authenticated;
grant execute on function public.ack_shortcut_observations(uuid[]) to authenticated;
