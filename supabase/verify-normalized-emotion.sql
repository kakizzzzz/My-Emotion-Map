-- Read-only verification for My Emotion Map normalized storage v2.
-- This file outputs counts/checksums only; it never prints app_states.payload.

select table_name,
  to_regclass('public.' || table_name) is not null as object_exists,
  coalesce(relation.relrowsecurity, false) as rls_enabled
from unnest(array[
  'emotion_settings',
  'emotion_preferences',
  'emotion_records',
  'emotion_conversations',
  'emotion_messages',
  'emotion_followups',
  'emotion_revisits',
  'emotion_entity_history'
]) as requested(table_name)
left join pg_class relation on relation.oid = to_regclass('public.' || table_name)
order by table_name;

select
  to_regprocedure('public.apply_emotion_mutations(bigint,jsonb)') is not null
    as apply_rpc_exists,
  to_regprocedure('public.migrate_emotion_archive_user(uuid)') is not null
    as migration_rpc_exists,
  to_regprocedure('public.purge_expired_emotion_trash()') is not null
    as owner_purge_rpc_exists,
  has_function_privilege(
    'authenticated', 'public.apply_emotion_mutations(bigint,jsonb)', 'EXECUTE'
  ) as authenticated_can_apply,
  not has_table_privilege('authenticated', 'public.app_states', 'SELECT')
    as authenticated_archive_read_revoked,
  not has_table_privilege('authenticated', 'public.app_states', 'INSERT,UPDATE,DELETE')
    as authenticated_archive_write_revoked,
  has_table_privilege('service_role', 'public.app_states', 'SELECT')
    as service_role_archive_read_only;

select
  (select count(*) from public.app_states) as archive_user_count,
  (select count(*) from public.emotion_settings) as normalized_user_count,
  (select count(*) from public.emotion_records where deleted_at is null) as record_count,
  (select count(*) from public.emotion_conversations where deleted_at is null) as conversation_count,
  (select count(*) from public.emotion_messages where deleted_at is null) as message_count,
  (select count(*) from public.emotion_followups where deleted_at is null) as followup_count,
  (select count(*) from public.emotion_revisits where deleted_at is null) as revisit_count,
  (select count(*) from public.app_states archive
    where greatest(
      archive.schema_version,
      coalesce((archive.payload ->> 'schemaVersion')::integer, 1)
    ) > 6) as future_schema_count,
  (select count(*) from public.emotion_settings settings
    where settings.migration_verified_at is null) as unverified_normalized_user_count;

with archive_stats as (
  select archive.user_id,
    archive.revision as archive_revision,
    jsonb_array_length(coalesce(archive.payload -> 'moments', '[]'::jsonb))
      as archive_record_count,
    jsonb_array_length(coalesce(archive.payload -> 'conversations', '[]'::jsonb))
      as archive_conversation_count,
    (
      select count(*)
      from jsonb_array_elements(coalesce(archive.payload -> 'conversations', '[]'::jsonb))
        with ordinality conversation(value, ordinality)
      cross join lateral jsonb_array_elements(
        coalesce(conversation.value -> 'messages', '[]'::jsonb)
      ) message(value)
      where coalesce(message.value ->> 'deliveryState', '') <> 'pending'
    ) as archive_message_count,
    jsonb_array_length(coalesce(archive.payload -> 'followUps', '[]'::jsonb))
      as archive_followup_count,
    jsonb_array_length(coalesce(archive.payload -> 'revisits', '[]'::jsonb))
      as archive_revisit_count,
    (
      select md5(coalesce(string_agg(
        moment.value ->> 'id', E'\n' order by moment.ordinality
      ), ''))
      from jsonb_array_elements(coalesce(archive.payload -> 'moments', '[]'::jsonb))
        with ordinality moment(value, ordinality)
    ) as archive_record_ids,
    (
      select md5(coalesce(string_agg(
        conversation.value ->> 'id', E'\n' order by conversation.ordinality
      ), ''))
      from jsonb_array_elements(coalesce(archive.payload -> 'conversations', '[]'::jsonb))
        with ordinality conversation(value, ordinality)
    ) as archive_conversation_ids,
    (
      select md5(coalesce(string_agg(
        conversation.value ->> 'id' || '/' || message.value ->> 'id', E'\n'
        order by conversation.ordinality, message.ordinality
      ), ''))
      from jsonb_array_elements(coalesce(archive.payload -> 'conversations', '[]'::jsonb))
        with ordinality conversation(value, ordinality)
      cross join lateral jsonb_array_elements(
        coalesce(conversation.value -> 'messages', '[]'::jsonb)
      ) with ordinality message(value, ordinality)
      where coalesce(message.value ->> 'deliveryState', '') <> 'pending'
    ) as archive_message_ids,
    (
      select md5(coalesce(string_agg(
        followup.value ->> 'id', E'\n' order by followup.ordinality
      ), ''))
      from jsonb_array_elements(coalesce(archive.payload -> 'followUps', '[]'::jsonb))
        with ordinality followup(value, ordinality)
    ) as archive_followup_ids,
    (
      select md5(coalesce(string_agg(
        revisit.value ->> 'id', E'\n' order by revisit.ordinality
      ), ''))
      from jsonb_array_elements(coalesce(archive.payload -> 'revisits', '[]'::jsonb))
        with ordinality revisit(value, ordinality)
    ) as archive_revisit_ids
  from public.app_states archive
), normalized_stats as (
  select settings.user_id,
    settings.dataset_revision,
    settings.data_model_version,
    settings.migration_verified_at,
    settings.migration_verification,
    (select count(*) from public.emotion_records record
      where record.user_id = settings.user_id and record.deleted_at is null)
      as record_count,
    (select count(*) from public.emotion_conversations conversation
      where conversation.user_id = settings.user_id and conversation.deleted_at is null)
      as conversation_count,
    (select count(*) from public.emotion_messages message
      where message.user_id = settings.user_id and message.deleted_at is null)
      as message_count,
    (select count(*) from public.emotion_followups followup
      where followup.user_id = settings.user_id and followup.deleted_at is null)
      as followup_count,
    (select count(*) from public.emotion_revisits revisit
      where revisit.user_id = settings.user_id and revisit.deleted_at is null)
      as revisit_count,
    (select md5(coalesce(string_agg(record.moment_id, E'\n'
      order by record.sort_order, record.moment_id), ''))
      from public.emotion_records record
      where record.user_id = settings.user_id and record.deleted_at is null)
      as record_ids,
    (select md5(coalesce(string_agg(conversation.id, E'\n'
      order by conversation.sort_order, conversation.id), ''))
      from public.emotion_conversations conversation
      where conversation.user_id = settings.user_id and conversation.deleted_at is null)
      as conversation_ids,
    (select md5(coalesce(string_agg(
      message.conversation_id || '/' || message.id, E'\n'
      order by conversation.sort_order, message.sort_order, message.id
    ), ''))
      from public.emotion_messages message
      join public.emotion_conversations conversation
        on conversation.user_id = message.user_id
        and conversation.id = message.conversation_id
      where message.user_id = settings.user_id and message.deleted_at is null
        and conversation.deleted_at is null) as message_ids,
    (select md5(coalesce(string_agg(followup.id, E'\n'
      order by followup.sort_order, followup.id), ''))
      from public.emotion_followups followup
      where followup.user_id = settings.user_id and followup.deleted_at is null)
      as followup_ids,
    (select md5(coalesce(string_agg(revisit.id, E'\n'
      order by revisit.sort_order, revisit.id), ''))
      from public.emotion_revisits revisit
      where revisit.user_id = settings.user_id and revisit.deleted_at is null)
      as revisit_ids
  from public.emotion_settings settings
), integrity as (
  select settings.user_id,
    (
      select count(*) from public.emotion_followups followup
      where followup.user_id = settings.user_id and not exists (
        select 1 from public.emotion_records record
        where record.user_id = followup.user_id and record.note_id = followup.note_id
      )
    ) + (
      select count(*) from public.emotion_revisits revisit
      where revisit.user_id = settings.user_id and not exists (
        select 1 from public.emotion_records record
        where record.user_id = revisit.user_id and record.note_id = revisit.note_id
      )
    ) + (
      select count(*) from public.emotion_messages message
      cross join lateral jsonb_array_elements_text(message.note_ids) note_id(value)
      where message.user_id = settings.user_id and not exists (
        select 1 from public.emotion_records record
        where record.user_id = message.user_id and record.note_id = note_id.value
      )
    ) as orphan_count,
    (
      select count(*) from (
        select record.moment_id from public.emotion_records record
        where record.user_id = settings.user_id group by record.moment_id having count(*) > 1
        union all
        select record.note_id from public.emotion_records record
        where record.user_id = settings.user_id group by record.note_id having count(*) > 1
      ) duplicate
    ) as duplicate_count
  from public.emotion_settings settings
)
select archive.user_id,
  archive.archive_revision,
  normalized.dataset_revision,
  normalized.data_model_version,
  normalized.migration_verified_at,
  archive.archive_record_count,
  normalized.record_count,
  archive.archive_conversation_count,
  normalized.conversation_count,
  archive.archive_message_count,
  normalized.message_count,
  archive.archive_followup_count,
  normalized.followup_count,
  archive.archive_revisit_count,
  normalized.revisit_count,
  archive.archive_record_ids = normalized.record_ids
    and archive.archive_conversation_ids = normalized.conversation_ids
    and archive.archive_message_ids = normalized.message_ids
    and archive.archive_followup_ids = normalized.followup_ids
    and archive.archive_revisit_ids = normalized.revisit_ids as ids_match,
  coalesce((normalized.migration_verification ->> 'sortOrderMatch')::boolean, false)
    as sort_order_match,
  normalized.migration_verification ->> 'sourceSemanticChecksum'
    as source_semantic_checksum,
  normalized.migration_verification ->> 'normalizedSemanticChecksum'
    as normalized_semantic_checksum,
  coalesce((normalized.migration_verification ->> 'semanticChecksumMatch')::boolean, false)
    as semantic_checksum_match,
  integrity.orphan_count,
  integrity.duplicate_count,
  case when greatest(
    coalesce((normalized.migration_verification ->> 'archiveSchemaVersion')::integer, 1),
    1
  ) > 6 then 1 else 0 end as future_schema_count
from archive_stats archive
left join normalized_stats normalized on normalized.user_id = archive.user_id
left join integrity on integrity.user_id = archive.user_id
order by archive.user_id;
