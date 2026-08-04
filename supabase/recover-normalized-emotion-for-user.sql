-- Manual, same-account recovery from the immutable v1 app_states archive.
-- Replace the NULL below with exactly one auth.users UUID before running.
-- Never adapt this script to copy data between different user IDs.

begin;

lock table public.app_states in share row exclusive mode;

do $$
declare
  v_user_id uuid := null; -- REQUIRED: replace NULL with '00000000-0000-0000-0000-000000000000'::uuid
  v_archive_user_id uuid;
  v_verification jsonb;
begin
  if v_user_id is null then
    raise exception 'Set v_user_id to one explicit user UUID before recovery.';
  end if;

  select archive.user_id into v_archive_user_id
  from public.app_states archive
  where archive.user_id = v_user_id
  for share;
  if v_archive_user_id is null or v_archive_user_id <> v_user_id then
    raise exception 'The same-account archive does not exist for %', v_user_id;
  end if;

  -- Serialize with apply_emotion_mutations/purge on this exact account.
  perform settings.user_id
  from public.emotion_settings settings
  where settings.user_id = v_user_id
  for update;

  delete from public.emotion_messages where user_id = v_user_id;
  delete from public.emotion_revisits where user_id = v_user_id;
  delete from public.emotion_followups where user_id = v_user_id;
  delete from public.emotion_conversations where user_id = v_user_id;
  delete from public.emotion_records where user_id = v_user_id;
  delete from public.emotion_entity_history where user_id = v_user_id;
  delete from public.emotion_preferences where user_id = v_user_id;
  delete from public.emotion_settings where user_id = v_user_id;

  -- This function reconstructs only v_user_id and repeats count, ID/order,
  -- reference, and semantic checksum verification before marking it verified.
  v_verification := public.migrate_emotion_archive_user(v_user_id);
  if not coalesce((v_verification ->> 'idsMatch')::boolean, false)
    or not coalesce((v_verification ->> 'sortOrderMatch')::boolean, false)
    or not coalesce((v_verification ->> 'semanticChecksumMatch')::boolean, false) then
    raise exception 'Same-account recovery verification failed for %', v_user_id;
  end if;
end;
$$;

commit;
