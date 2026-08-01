-- Durable per-user hourly quotas for the two AI features.
create table if not exists public.ai_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('photo-assist', 'emotion-chat')),
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (user_id, feature, window_start)
);

alter table public.ai_rate_limits enable row level security;
revoke all on table public.ai_rate_limits from public, anon, authenticated;

create or replace function public.claim_ai_quota(p_feature text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_window timestamptz := date_trunc('hour', now());
  v_limit integer;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  v_limit := case p_feature
    when 'photo-assist' then 5
    when 'emotion-chat' then 10
    else null
  end;
  if v_limit is null then
    raise exception 'unsupported feature' using errcode = '22023';
  end if;

  insert into public.ai_rate_limits(user_id, feature, window_start, request_count)
  values (v_user_id, p_feature, v_window, 1)
  on conflict (user_id, feature, window_start)
  do update set request_count = public.ai_rate_limits.request_count + 1
    where public.ai_rate_limits.request_count < v_limit
  returning request_count into v_count;

  delete from public.ai_rate_limits
  where user_id = v_user_id and window_start < v_window - interval '48 hours';
  return v_count is not null and v_count <= v_limit;
end;
$$;

revoke all on function public.claim_ai_quota(text) from public, anon;
grant execute on function public.claim_ai_quota(text) to authenticated;
