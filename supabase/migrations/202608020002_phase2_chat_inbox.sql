create table if not exists public.emotion_chat_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null check (
    length(request_id) between 1 and 200 and
    request_id ~ '^[A-Za-z0-9:_-]+$'
  ),
  status text not null default 'claimed' check (status in ('claimed', 'completed')),
  response_payload jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  primary key (user_id, request_id),
  check ((status = 'completed') = (response_payload is not null))
);

create index if not exists emotion_chat_requests_expiry_idx
on public.emotion_chat_requests (expires_at);

alter table public.emotion_chat_requests enable row level security;
revoke all on public.emotion_chat_requests from public, anon, authenticated;

create or replace function public.claim_emotion_chat_request(p_request_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.emotion_chat_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_request_id is null or length(p_request_id) not between 1 and 200 or
    p_request_id !~ '^[A-Za-z0-9:_-]+$' then
    raise exception 'invalid request id' using errcode = '22023';
  end if;

  delete from public.emotion_chat_requests
  where user_id = v_user_id and expires_at <= now();

  insert into public.emotion_chat_requests (user_id, request_id)
  values (v_user_id, p_request_id)
  on conflict do nothing
  returning * into v_row;
  if found then
    return jsonb_build_object('status', 'claimed');
  end if;

  select * into v_row
  from public.emotion_chat_requests
  where user_id = v_user_id and request_id = p_request_id
  for update;

  if v_row.status = 'completed' then
    return jsonb_build_object(
      'status', 'completed',
      'response', v_row.response_payload
    );
  end if;
  if v_row.created_at <= now() - interval '25 seconds' then
    update public.emotion_chat_requests
    set created_at = now(), expires_at = now() + interval '10 minutes'
    where user_id = v_user_id and request_id = p_request_id;
    return jsonb_build_object('status', 'claimed');
  end if;
  return jsonb_build_object('status', 'in_progress');
end;
$$;

create or replace function public.complete_emotion_chat_request(
  p_request_id text,
  p_response jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_response is null or jsonb_typeof(p_response) <> 'object' then
    return false;
  end if;
  update public.emotion_chat_requests
  set status = 'completed', response_payload = p_response,
      expires_at = now() + interval '10 minutes'
  where user_id = v_user_id and request_id = p_request_id and status = 'claimed';
  return found;
end;
$$;

create or replace function public.release_emotion_chat_request(p_request_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return false; end if;
  delete from public.emotion_chat_requests
  where user_id = v_user_id and request_id = p_request_id and status = 'claimed';
  return found;
end;
$$;

revoke all on function public.claim_emotion_chat_request(text) from public, anon;
revoke all on function public.complete_emotion_chat_request(text, jsonb) from public, anon;
revoke all on function public.release_emotion_chat_request(text) from public, anon;
grant execute on function public.claim_emotion_chat_request(text) to authenticated;
grant execute on function public.complete_emotion_chat_request(text, jsonb) to authenticated;
grant execute on function public.release_emotion_chat_request(text) to authenticated;

alter table public.shortcut_observations
  add column if not exists decision_reason text,
  add column if not exists threshold_snapshot jsonb,
  add column if not exists algorithm_version text,
  add column if not exists signal_level text;

update public.shortcut_observations as observation
set
  decision_reason = case
    when observation.is_test then 'test_event'
    when observation.context <> 'resting' then 'non_resting_review'
    when observation.low_signal then 'low_signal_review'
    else 'outside_resting_range'
  end,
  threshold_snapshot = jsonb_build_object(
    'restingMin', token.resting_min,
    'restingMax', token.resting_max
  ),
  algorithm_version = 'shortcut-heart-v2',
  signal_level = case when observation.low_signal then 'low' else 'standard' end
from public.shortcut_tokens as token
where observation.token_id = token.id and (
  observation.decision_reason is null or
  observation.threshold_snapshot is null or
  observation.algorithm_version is null or
  observation.signal_level is null
);

alter table public.shortcut_observations
  alter column decision_reason set not null,
  alter column threshold_snapshot set not null,
  alter column algorithm_version set not null,
  alter column signal_level set not null,
  add constraint shortcut_observations_decision_reason_check
    check (decision_reason in (
      'outside_resting_range', 'low_signal_review',
      'non_resting_review', 'test_event', 'legacy_review'
    )),
  add constraint shortcut_observations_signal_level_check
    check (signal_level in ('standard', 'low')),
  add constraint shortcut_observations_threshold_snapshot_check
    check (
      jsonb_typeof(threshold_snapshot) = 'object' and
      (threshold_snapshot->>'restingMin')::integer between 35 and 180 and
      (threshold_snapshot->>'restingMax')::integer between 40 and 220 and
      (threshold_snapshot->>'restingMax')::integer >
        (threshold_snapshot->>'restingMin')::integer
    );
