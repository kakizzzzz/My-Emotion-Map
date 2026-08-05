-- Language is an account-owned preference, not an authentication secret.
-- Keep avatarSrc blocked from the reviewed v2 core: the public wrapper
-- validates and removes it before the core runs, while history redaction keeps
-- avatar_data_url out of emotion_entity_history.

begin;

create or replace function public.emotion_json_has_sensitive_keys(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_entry record;
  v_child jsonb;
  v_key text;
begin
  if p_value is null then return false; end if;
  if jsonb_typeof(p_value) = 'object' then
    for v_entry in select key, value from jsonb_each(p_value) loop
      v_key := regexp_replace(lower(v_entry.key), '[^a-z0-9]', '', 'g');
      if v_key = any(array[
        'password', 'loginpassword', 'registerpassword', 'currentpassword',
        'newpassword', 'confirmpassword', 'invitecode', 'accesstoken',
        'refreshtoken', 'servicerolekey', 'databaseurl', 'supabasekey',
        'mcptoken', 'mylifememorytoken', 'shortcutpairingsecret',
        'siliconflowkey', 'session', 'avatarsrc', 'profileid'
      ]) then return true; end if;
      if public.emotion_json_has_sensitive_keys(v_entry.value) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in select value from jsonb_array_elements(p_value) loop
      if public.emotion_json_has_sensitive_keys(v_child) then return true; end if;
    end loop;
  end if;
  return false;
end;
$$;

do $$
begin
  if public.emotion_json_has_sensitive_keys('{"language":"zh"}'::jsonb) then
    raise exception 'Synced language is still classified as sensitive';
  end if;
  if not public.emotion_json_has_sensitive_keys(
    '{"accessToken":"must-remain-blocked"}'::jsonb
  ) then
    raise exception 'Authentication token guard is missing';
  end if;
end;
$$;

revoke all on function public.emotion_json_has_sensitive_keys(jsonb)
  from public, anon, authenticated;

commit;
