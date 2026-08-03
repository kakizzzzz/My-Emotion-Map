-- Add a separate hourly allowance for short voice summaries without rewriting history.
alter table public.ai_rate_limits
  drop constraint if exists ai_rate_limits_feature_check;

alter table public.ai_rate_limits
  add constraint ai_rate_limits_feature_check
  check (feature in ('photo-assist', 'emotion-chat', 'voice-summary'));

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
    when 'emotion-chat' then 60
    when 'voice-summary' then 30
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
