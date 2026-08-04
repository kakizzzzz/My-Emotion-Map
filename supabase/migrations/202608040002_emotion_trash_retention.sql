-- My Emotion Map normalized trash/history retention.
-- Tombstones remain visible to incremental clients for seven complete days.

begin;

create or replace function public.purge_expired_emotion_trash_for_user(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - interval '7 days';
  v_locked_user uuid;
  v_messages bigint := 0;
  v_revisits bigint := 0;
  v_followups bigint := 0;
  v_conversations bigint := 0;
  v_records bigint := 0;
  v_history bigint := 0;
  v_count bigint := 0;
begin
  if p_user_id is null then
    raise exception 'A single user UUID is required' using errcode = '22023';
  end if;

  -- This is the same per-account revision row lock used by mutation commits.
  -- Hard deletion does not change dataset_revision because every deleted row
  -- has already remained as a propagated tombstone for seven days.
  select settings.user_id into v_locked_user
  from public.emotion_settings settings
  where settings.user_id = p_user_id
  for update;
  if v_locked_user is null then
    return jsonb_build_object(
      'userId', p_user_id,
      'cutoff', v_cutoff,
      'messages', 0,
      'revisits', 0,
      'followUps', 0,
      'conversations', 0,
      'records', 0,
      'history', 0,
      'datasetRevisionChanged', false
    );
  end if;

  -- Dependents are removed before their parents. Only old tombstones qualify.
  delete from public.emotion_messages message
  where message.user_id = p_user_id
    and message.deleted_at is not null and message.deleted_at < v_cutoff;
  get diagnostics v_messages = row_count;

  delete from public.emotion_revisits revisit
  where revisit.user_id = p_user_id
    and revisit.deleted_at is not null and revisit.deleted_at < v_cutoff;
  get diagnostics v_revisits = row_count;

  delete from public.emotion_followups followup
  where followup.user_id = p_user_id
    and followup.deleted_at is not null and followup.deleted_at < v_cutoff;
  get diagnostics v_followups = row_count;

  delete from public.emotion_conversations conversation
  where conversation.user_id = p_user_id
    and conversation.deleted_at is not null and conversation.deleted_at < v_cutoff
    and not exists (
      select 1 from public.emotion_messages message
      where message.user_id = conversation.user_id
        and message.conversation_id = conversation.id
    );
  get diagnostics v_conversations = row_count;

  delete from public.emotion_records record
  where record.user_id = p_user_id
    and record.deleted_at is not null and record.deleted_at < v_cutoff
    and not exists (
      select 1 from public.emotion_followups followup
      where followup.user_id = record.user_id and followup.note_id = record.note_id
    )
    and not exists (
      select 1 from public.emotion_revisits revisit
      where revisit.user_id = record.user_id and revisit.note_id = record.note_id
    );
  get diagnostics v_records = row_count;

  delete from public.emotion_entity_history history
  where history.user_id = p_user_id
    and (
      history.changed_at < v_cutoff
      or history.id in (
        select old.id
        from public.emotion_entity_history old
        where old.user_id = p_user_id
          and old.entity_type = history.entity_type
          and old.entity_key = history.entity_key
        order by old.changed_at desc, old.id desc
        offset 20
      )
    );
  get diagnostics v_history = row_count;

  v_count := v_messages + v_revisits + v_followups +
    v_conversations + v_records + v_history;
  return jsonb_build_object(
    'userId', p_user_id,
    'cutoff', v_cutoff,
    'messages', v_messages,
    'revisits', v_revisits,
    'followUps', v_followups,
    'conversations', v_conversations,
    'records', v_records,
    'history', v_history,
    'totalRows', v_count,
    'datasetRevisionChanged', false
  );
end;
$$;

revoke all on function public.purge_expired_emotion_trash_for_user(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.purge_expired_emotion_trash()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  return public.purge_expired_emotion_trash_for_user(v_user_id);
end;
$$;

revoke all on function public.purge_expired_emotion_trash()
  from public, anon;
grant execute on function public.purge_expired_emotion_trash()
  to authenticated;

create or replace function public.purge_expired_emotion_trash_all_users()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  for v_user_id in
    select settings.user_id from public.emotion_settings settings
    order by settings.user_id
  loop
    v_result := public.purge_expired_emotion_trash_for_user(v_user_id);
    v_results := v_results || jsonb_build_array(v_result);
  end loop;
  return jsonb_build_object('accounts', v_results, 'ranAt', now());
end;
$$;

revoke all on function public.purge_expired_emotion_trash_all_users()
  from public, anon, authenticated;
grant execute on function public.purge_expired_emotion_trash_all_users()
  to service_role;

do $$
declare
  v_job_exists boolean := false;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select exists (
      select 1 from cron.job where jobname = $1
    )' into v_job_exists using 'emotion-trash-retention-daily';
    if not v_job_exists then
      execute 'select cron.schedule($1, $2, $3)'
        using 'emotion-trash-retention-daily', '23 3 * * *',
          'select public.purge_expired_emotion_trash_all_users();';
    end if;
  else
    raise notice 'pg_cron is unavailable; schedule purge_expired_emotion_trash_all_users manually.';
  end if;
end;
$$;

commit;
