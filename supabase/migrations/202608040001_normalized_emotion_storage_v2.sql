-- My Emotion Map normalized entity storage v2.
-- Additive, transactional, and idempotent. This migration never updates or
-- deletes public.app_states.payload; app_states is retained as the v1 archive.

begin;

lock table public.app_states in share row exclusive mode;
lock table public.account_profiles in share row exclusive mode;

create table if not exists public.emotion_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dataset_revision bigint not null default 0 check (dataset_revision >= 0),
  data_model_version integer not null default 2 check (data_model_version >= 2),
  changed_revision bigint not null default 0 check (changed_revision >= 0),
  theme_tone text not null default 'original'
    check (theme_tone in ('original', 'terracotta', 'blue', 'mauve')),
  theme_palette jsonb not null default '{"page":"#F3F3F3","card":"#D9D9D9","icon":"#C3C3C3","dark":"#5C5C5C"}'::jsonb
    check (jsonb_typeof(theme_palette) = 'object'),
  migration_verified_at timestamptz,
  migration_verification jsonb
    check (migration_verification is null or jsonb_typeof(migration_verification) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.emotion_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_name text not null default '' check (char_length(profile_name) <= 80),
  about_me text not null default '' check (char_length(about_me) <= 2000),
  ai_user_prompt text not null default '' check (char_length(ai_user_prompt) <= 500),
  ai_context_message_count integer not null default 8
    check (ai_context_message_count between 2 and 20),
  chat_preference_tags jsonb not null default '[]'::jsonb
    check (jsonb_typeof(chat_preference_tags) = 'array' and jsonb_array_length(chat_preference_tags) <= 20),
  follow_up_intervals jsonb not null default '[3,7,14]'::jsonb
    check (jsonb_typeof(follow_up_intervals) = 'array' and jsonb_array_length(follow_up_intervals) between 1 and 8),
  changed_revision bigint not null default 0 check (changed_revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.emotion_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  moment_id text not null check (char_length(moment_id) between 1 and 200),
  note_id text not null check (char_length(note_id) between 1 and 200),
  sort_order integer not null check (sort_order >= 0),
  longitude double precision not null check (longitude between -180 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  place text not null default '' check (char_length(place) <= 500),
  emotion text check (emotion is null or emotion in (
    'calm', 'joy', 'tender', 'curious', 'energized', 'connected',
    'heavy', 'restless', 'focused', 'overwhelmed', 'numb', 'mixed'
  )),
  intensity integer not null default 0 check (intensity between 0 and 5),
  place_rating text check (place_rating is null or place_rating in (
    'safe', 'comfortable', 'neutral', 'uneasy', 'distressing'
  )),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  tag_group_id bigint,
  tag_order bigint check (tag_order is null or tag_order > 0),
  local_date text not null check (local_date ~ '^\d{4}-\d{2}-\d{2}$'),
  local_time text not null check (local_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  occurred_at_utc timestamptz,
  time_zone text check (time_zone is null or char_length(time_zone) <= 100),
  utc_offset_minutes integer check (utc_offset_minutes is null or utc_offset_minutes between -840 and 840),
  time_precision text not null check (time_precision in ('minute', 'date', 'unknown')),
  event_time_source text not null check (event_time_source in ('user', 'device-created', 'photo-exif', 'legacy')),
  source text check (source is null or source in ('manual', 'current-location', 'photo')),
  photo_taken_at text,
  photo_taken_at_kind text check (photo_taken_at_kind is null or photo_taken_at_kind in ('local', 'offset')),
  photo_taken_at_source text check (photo_taken_at_source is null or photo_taken_at_source in ('DateTimeOriginal', 'CreateDate')),
  imported_at timestamptz,
  location_captured_at timestamptz,
  location_time_relation text check (location_time_relation is null or location_time_relation in ('event', 'confirmation', 'manual')),
  title text not null default '' check (char_length(title) <= 500),
  title_source text check (title_source is null or title_source in ('user', 'ai', 'fallback')),
  answers jsonb not null default '[]'::jsonb
    check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) <= 100),
  excerpt text not null default '' check (char_length(excerpt) <= 5000),
  is_draft boolean not null default false,
  is_new boolean not null default false,
  follow_up_enabled boolean not null default false,
  changed_revision bigint not null default 0 check (changed_revision >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, moment_id),
  unique (user_id, note_id),
  check ((emotion is not null) or intensity = 0)
);

create table if not exists public.emotion_conversations (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 200),
  sort_order integer not null check (sort_order >= 0),
  title text not null default '' check (char_length(title) <= 500),
  badge text check (badge is null or char_length(badge) <= 100),
  unread boolean not null default false,
  proactive boolean not null default false,
  kind text not null default 'regular' check (kind in ('regular', 'companion')),
  changed_revision bigint not null default 0 check (changed_revision >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create unique index if not exists emotion_conversations_one_companion_idx
  on public.emotion_conversations (user_id)
  where kind = 'companion' and deleted_at is null;

create table if not exists public.emotion_followups (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 200),
  note_id text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  interval_days integer not null check (interval_days between 1 and 365),
  due_at timestamptz not null,
  status text not null check (status in ('queued', 'active', 'answered', 'skipped')),
  follow_up_consented_at timestamptz,
  prompt_version integer check (prompt_version is null or prompt_version > 0),
  prompt text check (prompt is null or char_length(prompt) <= 5000),
  prompted_at timestamptz,
  response_option_id text check (response_option_id is null or response_option_id in ('lighter', 'stronger', 'different', 'same', 'skip')),
  answer_command_id text check (answer_command_id is null or char_length(answer_command_id) <= 200),
  response text check (response is null or char_length(response) <= 5000),
  response_kind text check (response_kind is null or response_kind in ('legacyPositive', 'calm', 'unchanged', 'lighter', 'stronger', 'different', 'same', 'skip')),
  answered_via text check (answered_via is null or answered_via in ('chat', 'inbox')),
  answered_at timestamptz,
  assistant_reply text check (assistant_reply is null or char_length(assistant_reply) <= 5000),
  seen_at timestamptz,
  changed_revision bigint not null default 0 check (changed_revision >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, note_id) references public.emotion_records(user_id, note_id)
);

create unique index if not exists emotion_followups_one_active_idx
  on public.emotion_followups (user_id)
  where status = 'active' and deleted_at is null;
create unique index if not exists emotion_followups_answer_command_idx
  on public.emotion_followups (user_id, answer_command_id)
  where answer_command_id is not null and deleted_at is null;

create table if not exists public.emotion_revisits (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 200),
  note_id text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  original_emotion text check (original_emotion is null or original_emotion in (
    'calm', 'joy', 'tender', 'curious', 'energized', 'connected',
    'heavy', 'restless', 'focused', 'overwhelmed', 'numb', 'mixed'
  )),
  change_direction text not null check (change_direction in ('lighter', 'stronger', 'different', 'same')),
  current_emotion text check (current_emotion is null or current_emotion in (
    'calm', 'joy', 'tender', 'curious', 'energized', 'connected',
    'heavy', 'restless', 'focused', 'overwhelmed', 'numb', 'mixed'
  )),
  original_occurred_at timestamptz not null,
  revisited_at timestamptz not null,
  source_follow_up_id text,
  changed_revision bigint not null default 0 check (changed_revision >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, note_id) references public.emotion_records(user_id, note_id),
  foreign key (user_id, source_follow_up_id) references public.emotion_followups(user_id, id)
);

create unique index if not exists emotion_revisits_source_followup_idx
  on public.emotion_revisits (user_id, source_follow_up_id)
  where source_follow_up_id is not null and deleted_at is null;

create table if not exists public.emotion_messages (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null,
  id text not null check (char_length(id) between 1 and 200),
  sort_order integer not null check (sort_order >= 0),
  role text not null check (role in ('user', 'assistant')),
  body text not null default '' check (char_length(body) <= 20000),
  kind text not null default 'message' check (kind in ('message', 'clarification', 'followup_prompt', 'followup_answer', 'followup_reply')),
  note_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(note_ids) = 'array' and jsonb_array_length(note_ids) <= 20),
  external_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(external_evidence) = 'array'),
  mcp_calls jsonb not null default '[]'::jsonb check (jsonb_typeof(mcp_calls) = 'array'),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  clarification_options jsonb not null default '[]'::jsonb check (jsonb_typeof(clarification_options) = 'array' and jsonb_array_length(clarification_options) <= 3),
  request_id text check (request_id is null or char_length(request_id) <= 200),
  reply_to_request_id text check (reply_to_request_id is null or char_length(reply_to_request_id) <= 200),
  delivery_state text check (delivery_state is null or delivery_state in ('delivered', 'failed', 'stopped')),
  retryable boolean not null default false,
  reference_confirmation jsonb check (reference_confirmation is null or jsonb_typeof(reference_confirmation) = 'object'),
  follow_up_id text,
  created_at timestamptz,
  changed_revision bigint not null default 0 check (changed_revision >= 0),
  deleted_at timestamptz,
  db_updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id, id),
  foreign key (user_id, conversation_id) references public.emotion_conversations(user_id, id),
  foreign key (user_id, follow_up_id) references public.emotion_followups(user_id, id)
);

create unique index if not exists emotion_messages_request_idx
  on public.emotion_messages (user_id, request_id)
  where request_id is not null and deleted_at is null;
create unique index if not exists emotion_messages_reply_idx
  on public.emotion_messages (user_id, reply_to_request_id)
  where reply_to_request_id is not null and role = 'assistant' and deleted_at is null;

create table if not exists public.emotion_entity_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'settings', 'preferences', 'record', 'conversation', 'message', 'followup', 'revisit'
  )),
  entity_key text not null,
  operation text not null check (operation in ('update', 'soft_delete')),
  before_data jsonb not null,
  dataset_revision bigint not null check (dataset_revision >= 0),
  changed_at timestamptz not null default now()
);

create index if not exists emotion_records_user_sort_idx
  on public.emotion_records (user_id, sort_order, moment_id) where deleted_at is null;
create index if not exists emotion_records_user_revision_idx
  on public.emotion_records (user_id, changed_revision);
create index if not exists emotion_conversations_user_sort_idx
  on public.emotion_conversations (user_id, sort_order, id) where deleted_at is null;
create index if not exists emotion_conversations_user_revision_idx
  on public.emotion_conversations (user_id, changed_revision);
create index if not exists emotion_messages_user_sort_idx
  on public.emotion_messages (user_id, conversation_id, sort_order, id) where deleted_at is null;
create index if not exists emotion_messages_user_revision_idx
  on public.emotion_messages (user_id, changed_revision);
create index if not exists emotion_followups_user_revision_idx
  on public.emotion_followups (user_id, changed_revision);
create index if not exists emotion_revisits_user_revision_idx
  on public.emotion_revisits (user_id, changed_revision);
create index if not exists emotion_history_entity_idx
  on public.emotion_entity_history (user_id, entity_type, entity_key, changed_at desc, id desc);

alter table public.emotion_settings enable row level security;
alter table public.emotion_preferences enable row level security;
alter table public.emotion_records enable row level security;
alter table public.emotion_conversations enable row level security;
alter table public.emotion_messages enable row level security;
alter table public.emotion_followups enable row level security;
alter table public.emotion_revisits enable row level security;
alter table public.emotion_entity_history enable row level security;

revoke all on public.emotion_settings from public, anon, authenticated, service_role;
revoke all on public.emotion_preferences from public, anon, authenticated, service_role;
revoke all on public.emotion_records from public, anon, authenticated, service_role;
revoke all on public.emotion_conversations from public, anon, authenticated, service_role;
revoke all on public.emotion_messages from public, anon, authenticated, service_role;
revoke all on public.emotion_followups from public, anon, authenticated, service_role;
revoke all on public.emotion_revisits from public, anon, authenticated, service_role;
revoke all on public.emotion_entity_history from public, anon, authenticated, service_role;

grant select on public.emotion_settings to authenticated;
grant select on public.emotion_preferences to authenticated;
grant select on public.emotion_records to authenticated;
grant select on public.emotion_conversations to authenticated;
grant select on public.emotion_messages to authenticated;
grant select on public.emotion_followups to authenticated;
grant select on public.emotion_revisits to authenticated;
grant select on public.emotion_entity_history to authenticated;
grant select on public.emotion_settings to service_role;
grant select on public.emotion_preferences to service_role;
grant select on public.emotion_records to service_role;
grant select on public.emotion_conversations to service_role;
grant select on public.emotion_messages to service_role;
grant select on public.emotion_followups to service_role;
grant select on public.emotion_revisits to service_role;
grant select on public.emotion_entity_history to service_role;

drop policy if exists "emotion_settings_select_own" on public.emotion_settings;
create policy "emotion_settings_select_own" on public.emotion_settings
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "emotion_preferences_select_own" on public.emotion_preferences;
create policy "emotion_preferences_select_own" on public.emotion_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "emotion_records_select_own" on public.emotion_records;
create policy "emotion_records_select_own" on public.emotion_records
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "emotion_conversations_select_own" on public.emotion_conversations;
create policy "emotion_conversations_select_own" on public.emotion_conversations
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "emotion_messages_select_own" on public.emotion_messages;
create policy "emotion_messages_select_own" on public.emotion_messages
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "emotion_followups_select_own" on public.emotion_followups;
create policy "emotion_followups_select_own" on public.emotion_followups
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "emotion_revisits_select_own" on public.emotion_revisits;
create policy "emotion_revisits_select_own" on public.emotion_revisits
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "emotion_history_select_own" on public.emotion_entity_history;
create policy "emotion_history_select_own" on public.emotion_entity_history
  for select to authenticated using ((select auth.uid()) = user_id);

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
        'siliconflowkey', 'session', 'avatarsrc', 'profileid', 'language'
      ]) then return true; end if;
      if public.emotion_json_has_sensitive_keys(v_entry.value) then return true; end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in select value from jsonb_array_elements(p_value) loop
      if public.emotion_json_has_sensitive_keys(v_child) then return true; end if;
    end loop;
  end if;
  return false;
end;
$$;

revoke all on function public.emotion_json_has_sensitive_keys(jsonb)
  from public, anon, authenticated;

create or replace function public.emotion_string_array_is_valid(
  p_value jsonb,
  p_max_items integer,
  p_max_length integer
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p_value) = 'array'
    and jsonb_array_length(p_value) <= p_max_items
    and not exists (
      select 1 from jsonb_array_elements(p_value) item
      where jsonb_typeof(item) <> 'string'
        or char_length(item #>> '{}') not between 1 and p_max_length
    );
$$;

create or replace function public.emotion_local_date_is_valid(p_value text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  return to_char(p_value::date, 'YYYY-MM-DD') = p_value;
exception when others then
  return false;
end;
$$;

create or replace function public.emotion_json_integer_is_valid(
  p_value jsonb,
  p_min bigint,
  p_max bigint
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
begin
  if jsonb_typeof(p_value) <> 'number' or p_value::text !~ '^-?\d+$' then
    return false;
  end if;
  return p_value::text::bigint between p_min and p_max;
exception when others then
  return false;
end;
$$;

create or replace function public.emotion_theme_palette_is_valid(p_value jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p_value) = 'object'
    and (select count(*) from jsonb_object_keys(p_value)) = 4
    and not exists (
      select 1 from jsonb_each_text(p_value) color
      where color.key not in ('page', 'card', 'icon', 'dark')
        or color.value !~ '^#[0-9A-Fa-f]{6}$'
    );
$$;

create or replace function public.emotion_followup_curve_is_valid(p_value jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p_value) = 'array'
    and jsonb_array_length(p_value) between 1 and 8
    and not exists (
      select 1
      from (
        select item.value,
          lag(item.value) over (order by item.ordinality) as previous_value
        from jsonb_array_elements(p_value) with ordinality item(value, ordinality)
      ) curve
      where case
        when jsonb_typeof(curve.value) <> 'number'
          or (curve.value #>> '{}') !~ '^\d+$' then true
        when curve.previous_value is not null and (
          jsonb_typeof(curve.previous_value) <> 'number'
          or (curve.previous_value #>> '{}') !~ '^\d+$'
        ) then true
        else (curve.value #>> '{}')::integer not between 1 and 365
          or (curve.previous_value is not null and
            (curve.previous_value #>> '{}')::integer >=
            (curve.value #>> '{}')::integer)
      end
    );
$$;

create or replace function public.emotion_answers_are_valid(p_value jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p_value) = 'array'
    and jsonb_array_length(p_value) <= 100
    and not exists (
      select 1 from jsonb_array_elements(p_value) answer(value)
      where jsonb_typeof(answer.value) <> 'object'
        or char_length(coalesce(answer.value ->> 'id', '')) not between 1 and 200
        or char_length(coalesce(answer.value ->> 'question', '')) not between 1 and 1000
        or char_length(coalesce(answer.value ->> 'answer', '')) > 20000
        or (
          answer.value ? 'role' and answer.value ->> 'role' not in (
            'purpose', 'ai', 'fallback', 'legacy'
          )
        )
    );
$$;

create or replace function public.emotion_message_metadata_is_valid(
  p_note_ids jsonb,
  p_external_evidence jsonb,
  p_mcp_calls jsonb,
  p_options jsonb,
  p_clarification_options jsonb,
  p_reference_confirmation jsonb
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select public.emotion_string_array_is_valid(p_note_ids, 20, 200)
    and jsonb_typeof(p_external_evidence) = 'array'
    and jsonb_array_length(p_external_evidence) <= 6
    and not exists (
      select 1 from jsonb_array_elements(p_external_evidence) evidence(value)
      where jsonb_typeof(evidence.value) <> 'object'
        or char_length(coalesce(evidence.value ->> 'referenceId', '')) not between 1 and 200
        or char_length(coalesce(evidence.value ->> 'title', '')) not between 1 and 200
        or char_length(coalesce(evidence.value ->> 'date', '')) > 10
        or char_length(coalesce(evidence.value ->> 'place', '')) > 160
        or char_length(coalesce(evidence.value ->> 'matchReason', '')) > 80
        or coalesce(evidence.value ->> 'source', '') <> 'my_life_memory_external'
    )
    and jsonb_typeof(p_mcp_calls) = 'array'
    and jsonb_array_length(p_mcp_calls) <= 2
    and not exists (
      select 1 from jsonb_array_elements(p_mcp_calls) call(value)
      where jsonb_typeof(call.value) <> 'object'
        or coalesce(call.value ->> 'server', '') <> 'my_life_memory'
        or coalesce(call.value ->> 'toolName', '') not in (
          'research_memory_context', 'search_memories', 'list_locations',
          'get_location_memory', 'get_day_memory', 'summarize_memory_range',
          'get_memory_images', 'get_routes'
        )
        or coalesce(call.value ->> 'status', '') not in ('completed', 'not_found', 'unavailable')
    )
    and jsonb_typeof(p_options) = 'array'
    and jsonb_array_length(p_options) <= 20
    and not exists (
      select 1 from jsonb_array_elements(p_options) option(value)
      where jsonb_typeof(option.value) <> 'object'
        or char_length(coalesce(option.value ->> 'id', '')) not between 1 and 200
        or char_length(coalesce(option.value ->> 'label', '')) not between 1 and 1000
        or coalesce(option.value ->> 'responseKind', '') not in (
          'lighter', 'stronger', 'different', 'same', 'skip'
        )
    )
    and jsonb_typeof(p_clarification_options) = 'array'
    and jsonb_array_length(p_clarification_options) <= 3
    and not exists (
      select 1 from jsonb_array_elements(p_clarification_options) option(value)
      where jsonb_typeof(option.value) <> 'object'
        or char_length(coalesce(option.value ->> 'optionId', '')) not between 1 and 200
        or char_length(coalesce(option.value ->> 'label', '')) not between 1 and 300
        or char_length(coalesce(option.value ->> 'continuationToken', '')) not between 1 and 4000
    )
    and (
      p_reference_confirmation is null
      or (
        jsonb_typeof(p_reference_confirmation) = 'object'
        and char_length(coalesce(p_reference_confirmation ->> 'optionId', '')) between 1 and 200
        and char_length(coalesce(
          p_reference_confirmation ->> 'continuationToken', ''
        )) between 1 and 4000
      )
    );
$$;

revoke all on function public.emotion_theme_palette_is_valid(jsonb)
  from public, anon, authenticated;
revoke all on function public.emotion_local_date_is_valid(text)
  from public, anon, authenticated;
revoke all on function public.emotion_json_integer_is_valid(jsonb, bigint, bigint)
  from public, anon, authenticated;
revoke all on function public.emotion_followup_curve_is_valid(jsonb)
  from public, anon, authenticated;
revoke all on function public.emotion_answers_are_valid(jsonb)
  from public, anon, authenticated;
revoke all on function public.emotion_message_metadata_is_valid(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'emotion_settings_theme_palette_valid'
      and conrelid = 'public.emotion_settings'::regclass
  ) then
    alter table public.emotion_settings add constraint emotion_settings_theme_palette_valid
      check (public.emotion_theme_palette_is_valid(theme_palette));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'emotion_preferences_followup_curve_valid'
      and conrelid = 'public.emotion_preferences'::regclass
  ) then
    alter table public.emotion_preferences add constraint emotion_preferences_followup_curve_valid
      check (public.emotion_followup_curve_is_valid(follow_up_intervals));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'emotion_preferences_tags_valid'
      and conrelid = 'public.emotion_preferences'::regclass
  ) then
    alter table public.emotion_preferences add constraint emotion_preferences_tags_valid
      check (public.emotion_string_array_is_valid(chat_preference_tags, 20, 200));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'emotion_records_answers_valid'
      and conrelid = 'public.emotion_records'::regclass
  ) then
    alter table public.emotion_records add constraint emotion_records_answers_valid
      check (public.emotion_answers_are_valid(answers));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'emotion_records_local_date_valid'
      and conrelid = 'public.emotion_records'::regclass
  ) then
    alter table public.emotion_records add constraint emotion_records_local_date_valid
      check (public.emotion_local_date_is_valid(local_date));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'emotion_messages_metadata_valid'
      and conrelid = 'public.emotion_messages'::regclass
  ) then
    alter table public.emotion_messages add constraint emotion_messages_metadata_valid
      check (public.emotion_message_metadata_is_valid(
        note_ids, external_evidence, mcp_calls, options,
        clarification_options, reference_confirmation
      ));
  end if;
end;
$$;

create or replace function public.record_emotion_history(
  p_user_id uuid,
  p_entity_type text,
  p_entity_key text,
  p_operation text,
  p_before_data jsonb,
  p_revision bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_before_data is null or public.emotion_json_has_sensitive_keys(p_before_data) then
    raise exception 'Invalid or sensitive history payload' using errcode = '22023';
  end if;
  insert into public.emotion_entity_history (
    user_id, entity_type, entity_key, operation, before_data, dataset_revision
  ) values (
    p_user_id, p_entity_type, p_entity_key, p_operation, p_before_data, p_revision
  );
  delete from public.emotion_entity_history history
  where history.user_id = p_user_id
    and (
      history.changed_at < now() - interval '7 days'
      or history.id in (
        select old.id from public.emotion_entity_history old
        where old.user_id = p_user_id
          and old.entity_type = p_entity_type
          and old.entity_key = p_entity_key
        order by old.changed_at desc, old.id desc
        offset 20
      )
    );
end;
$$;

revoke all on function public.record_emotion_history(uuid, text, text, text, jsonb, bigint)
  from public, anon, authenticated;

create or replace function public.initialize_normalized_emotion_account(
  p_user_id uuid,
  p_profile_name text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null or char_length(coalesce(p_profile_name, '')) > 80 then
    raise exception 'Invalid normalized account input' using errcode = '22023';
  end if;
  insert into public.emotion_settings (
    user_id, migration_verified_at, migration_verification
  ) values (
    p_user_id, now(), jsonb_build_object('source', 'new_account', 'verifiedAt', now())
  ) on conflict (user_id) do nothing;
  insert into public.emotion_preferences (user_id, profile_name)
  values (p_user_id, coalesce(p_profile_name, ''))
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.initialize_normalized_emotion_account(uuid, text)
  from public, anon, authenticated;
grant execute on function public.initialize_normalized_emotion_account(uuid, text)
  to service_role;

create or replace function public.apply_emotion_mutations(
  p_expected_revision bigint,
  p_mutations jsonb
)
returns table(saved boolean, dataset_revision bigint, conflict jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_revision bigint;
  v_verified boolean;
  v_next_revision bigint;
  v_mutation jsonb;
  v_payload jsonb;
  v_type text;
  v_id text;
  v_parent_id text;
  v_before jsonb;
  v_status text;
  v_existing_status text;
  v_note_id text;
  v_note_ids jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_mutations is null or jsonb_typeof(p_mutations) <> 'array'
    or jsonb_array_length(p_mutations) not between 1 and 500 then
    raise exception 'Mutation batch size must be between 1 and 500' using errcode = '22023';
  end if;

  select settings.dataset_revision,
    settings.data_model_version >= 2 and settings.migration_verified_at is not null
  into v_current_revision, v_verified
  from public.emotion_settings settings
  where settings.user_id = v_user_id
  for update;

  if v_current_revision is null or not coalesce(v_verified, false) then
    raise exception 'Normalized emotion storage v2 is not migrated or verified.'
      using errcode = '55000', hint = 'normalized_emotion_storage_not_ready';
  end if;
  if v_current_revision <> greatest(0, coalesce(p_expected_revision, 0)) then
    return query select false, v_current_revision, jsonb_build_object(
      'code', 'revision_conflict',
      'expectedRevision', greatest(0, coalesce(p_expected_revision, 0)),
      'actualRevision', v_current_revision
    );
    return;
  end if;
  v_next_revision := v_current_revision + 1;

  -- The server owns dependency ordering. Non-active follow-up changes are
  -- applied before active ones; dependent deletes precede parent deletes.
  for v_mutation in
    select item.value
    from jsonb_array_elements(p_mutations) with ordinality item(value, position)
    order by case item.value ->> 'type'
      when 'settings_update' then 10
      when 'preferences_update' then 20
      when 'record_upsert' then 30
      when 'conversation_upsert' then 40
      when 'followup_upsert' then case when item.value #>> '{payload,status}' = 'active' then 65 else 50 end
      when 'revisit_upsert' then 60
      when 'message_upsert' then 70
      when 'message_soft_delete' then 80
      when 'revisit_soft_delete' then 90
      when 'followup_soft_delete' then 100
      when 'conversation_soft_delete' then 110
      when 'record_soft_delete' then 120
      else 999 end,
      item.position
  loop
    if jsonb_typeof(v_mutation) <> 'object' then
      raise exception 'Each mutation must be an object' using errcode = '22023';
    end if;
    v_type := coalesce(v_mutation ->> 'type', '');
    v_payload := coalesce(v_mutation -> 'payload', '{}'::jsonb);
    v_id := coalesce(v_mutation ->> 'entityId', '');
    v_parent_id := coalesce(v_mutation ->> 'parentId', '');
    v_before := null;
    if char_length(v_id) not between 1 and 200 then
      raise exception 'Invalid entity ID' using errcode = '22023';
    end if;
    if public.emotion_json_has_sensitive_keys(v_payload) then
      raise exception 'Mutation payload contains sensitive fields' using errcode = '22023';
    end if;

    if v_type = 'settings_update' then
      select to_jsonb(settings) into v_before
      from public.emotion_settings settings where settings.user_id = v_user_id;
      perform public.record_emotion_history(
        v_user_id, 'settings', v_user_id::text, 'update', v_before, v_next_revision
      );
      if not public.emotion_json_integer_is_valid(
          v_payload -> 'schemaVersion', 1, 6
        )
        or coalesce(v_payload ->> 'themeTone', '') not in ('original', 'terracotta', 'blue', 'mauve')
        or not coalesce(public.emotion_theme_palette_is_valid(
          v_payload -> 'themePalette'
        ), false) then
        raise exception 'Invalid theme settings' using errcode = '22023';
      end if;
      update public.emotion_settings set
        theme_tone = v_payload ->> 'themeTone',
        theme_palette = v_payload -> 'themePalette',
        changed_revision = v_next_revision,
        updated_at = now()
      where user_id = v_user_id;

    elsif v_type = 'preferences_update' then
      select to_jsonb(preferences) into v_before
      from public.emotion_preferences preferences where preferences.user_id = v_user_id;
      if v_before is null then
        raise exception 'Emotion preferences are missing' using errcode = 'P0002';
      end if;
      perform public.record_emotion_history(
        v_user_id, 'preferences', v_user_id::text, 'update', v_before, v_next_revision
      );
      if char_length(coalesce(v_payload ->> 'profileName', '')) > 80
        or jsonb_typeof(v_payload -> 'profileName') <> 'string'
        or jsonb_typeof(v_payload -> 'aboutMe') <> 'string'
        or jsonb_typeof(v_payload -> 'aiUserPrompt') <> 'string'
        or char_length(coalesce(v_payload ->> 'aboutMe', '')) > 2000
        or char_length(coalesce(v_payload ->> 'aiUserPrompt', '')) > 500
        or not public.emotion_json_integer_is_valid(
          v_payload -> 'aiContextMessageCount', 2, 20
        )
        or not coalesce(public.emotion_string_array_is_valid(
          v_payload -> 'chatPreferenceTags', 20, 200
        ), false)
        or not coalesce(public.emotion_followup_curve_is_valid(
          v_payload -> 'followUpIntervals'
        ), false) then
        raise exception 'Invalid emotion preferences' using errcode = '22023';
      end if;
      update public.emotion_preferences set
        profile_name = coalesce(v_payload ->> 'profileName', ''),
        about_me = coalesce(v_payload ->> 'aboutMe', ''),
        ai_user_prompt = coalesce(v_payload ->> 'aiUserPrompt', ''),
        ai_context_message_count = (v_payload ->> 'aiContextMessageCount')::integer,
        chat_preference_tags = v_payload -> 'chatPreferenceTags',
        follow_up_intervals = v_payload -> 'followUpIntervals',
        changed_revision = v_next_revision,
        updated_at = now()
      where user_id = v_user_id;

    elsif v_type = 'record_upsert' then
      if coalesce(v_payload ->> 'momentId', '') <> v_id
        or char_length(coalesce(v_payload ->> 'noteId', '')) not between 1 and 200
        or jsonb_typeof(v_payload -> 'momentId') <> 'string'
        or jsonb_typeof(v_payload -> 'noteId') <> 'string'
        or jsonb_typeof(v_payload -> 'place') <> 'string'
        or jsonb_typeof(v_payload -> 'title') <> 'string'
        or jsonb_typeof(v_payload -> 'excerpt') <> 'string'
        or jsonb_typeof(v_payload -> 'longitude') <> 'number'
        or jsonb_typeof(v_payload -> 'latitude') <> 'number'
        or (v_payload ->> 'longitude')::double precision not between -180 and 180
        or (v_payload ->> 'latitude')::double precision not between -90 and 90
        or not public.emotion_json_integer_is_valid(
          v_payload -> 'sortOrder', 0, 2147483647
        )
        or not public.emotion_json_integer_is_valid(v_payload -> 'intensity', 0, 5)
        or (v_payload ->> 'emotion') is not null and (v_payload ->> 'emotion') not in (
          'calm', 'joy', 'tender', 'curious', 'energized', 'connected',
          'heavy', 'restless', 'focused', 'overwhelmed', 'numb', 'mixed'
        )
        or ((v_payload ->> 'emotion') is null and coalesce((v_payload ->> 'intensity')::integer, 0) <> 0)
        or (v_payload ->> 'placeRating') is not null and (v_payload ->> 'placeRating') not in (
          'safe', 'comfortable', 'neutral', 'uneasy', 'distressing'
        )
        or not public.emotion_local_date_is_valid(v_payload ->> 'localDate')
        or coalesce(v_payload ->> 'localTime', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
        or coalesce(v_payload ->> 'timePrecision', '') not in ('minute', 'date', 'unknown')
        or coalesce(v_payload ->> 'eventTimeSource', '') not in ('user', 'device-created', 'photo-exif', 'legacy')
        or not coalesce(public.emotion_answers_are_valid(v_payload -> 'answers'), false)
        or jsonb_typeof(v_payload -> 'isDraft') <> 'boolean'
        or jsonb_typeof(v_payload -> 'isNew') <> 'boolean'
        or jsonb_typeof(v_payload -> 'followUpEnabled') <> 'boolean'
        or (v_payload ? 'utcOffsetMinutes' and v_payload -> 'utcOffsetMinutes' <> 'null'::jsonb
          and not public.emotion_json_integer_is_valid(
            v_payload -> 'utcOffsetMinutes', -840, 840
          ))
        or (v_payload ? 'tagGroupId' and v_payload -> 'tagGroupId' <> 'null'::jsonb
          and not public.emotion_json_integer_is_valid(
            v_payload -> 'tagGroupId', -9223372036854775807, 9223372036854775807
          ))
        or (v_payload ? 'tagOrder' and v_payload -> 'tagOrder' <> 'null'::jsonb
          and not public.emotion_json_integer_is_valid(
            v_payload -> 'tagOrder', 1, 9223372036854775807
          ))
        or char_length(coalesce(v_payload ->> 'place', '')) > 500
        or char_length(coalesce(v_payload ->> 'title', '')) > 500
        or char_length(coalesce(v_payload ->> 'excerpt', '')) > 5000 then
        raise exception 'Invalid emotion record payload' using errcode = '22023';
      end if;
      select to_jsonb(record) into v_before from public.emotion_records record
      where record.user_id = v_user_id and record.moment_id = v_id;
      if v_before is not null then
        perform public.record_emotion_history(
          v_user_id, 'record', v_id, 'update', v_before, v_next_revision
        );
      end if;
      insert into public.emotion_records (
        user_id, moment_id, note_id, sort_order, longitude, latitude, place,
        emotion, intensity, place_rating, color, tag_group_id, tag_order,
        local_date, local_time, occurred_at_utc, time_zone, utc_offset_minutes,
        time_precision, event_time_source, source, photo_taken_at,
        photo_taken_at_kind, photo_taken_at_source, imported_at,
        location_captured_at, location_time_relation, title, title_source,
        answers, excerpt, is_draft, is_new, follow_up_enabled,
        changed_revision, deleted_at, updated_at
      ) values (
        v_user_id, v_id, v_payload ->> 'noteId', (v_payload ->> 'sortOrder')::integer,
        (v_payload ->> 'longitude')::double precision, (v_payload ->> 'latitude')::double precision,
        coalesce(v_payload ->> 'place', ''), nullif(v_payload ->> 'emotion', ''),
        (v_payload ->> 'intensity')::integer, nullif(v_payload ->> 'placeRating', ''),
        nullif(v_payload ->> 'color', ''), nullif(v_payload ->> 'tagGroupId', '')::bigint,
        nullif(v_payload ->> 'tagOrder', '')::bigint, v_payload ->> 'localDate',
        v_payload ->> 'localTime', nullif(v_payload ->> 'occurredAtUtc', '')::timestamptz,
        nullif(v_payload ->> 'timeZone', ''), nullif(v_payload ->> 'utcOffsetMinutes', '')::integer,
        v_payload ->> 'timePrecision', v_payload ->> 'eventTimeSource',
        nullif(v_payload ->> 'source', ''), nullif(v_payload ->> 'photoTakenAt', ''),
        nullif(v_payload ->> 'photoTakenAtKind', ''), nullif(v_payload ->> 'photoTakenAtSource', ''),
        nullif(v_payload ->> 'importedAt', '')::timestamptz,
        nullif(v_payload ->> 'locationCapturedAt', '')::timestamptz,
        nullif(v_payload ->> 'locationTimeRelation', ''), coalesce(v_payload ->> 'title', ''),
        nullif(v_payload ->> 'titleSource', ''), v_payload -> 'answers',
        coalesce(v_payload ->> 'excerpt', ''), coalesce((v_payload ->> 'isDraft')::boolean, false),
        coalesce((v_payload ->> 'isNew')::boolean, false),
        coalesce((v_payload ->> 'followUpEnabled')::boolean, false),
        v_next_revision, null, now()
      ) on conflict (user_id, moment_id) do update set
        note_id = excluded.note_id, sort_order = excluded.sort_order,
        longitude = excluded.longitude, latitude = excluded.latitude, place = excluded.place,
        emotion = excluded.emotion, intensity = excluded.intensity,
        place_rating = excluded.place_rating, color = excluded.color,
        tag_group_id = excluded.tag_group_id, tag_order = excluded.tag_order,
        local_date = excluded.local_date, local_time = excluded.local_time,
        occurred_at_utc = excluded.occurred_at_utc, time_zone = excluded.time_zone,
        utc_offset_minutes = excluded.utc_offset_minutes,
        time_precision = excluded.time_precision, event_time_source = excluded.event_time_source,
        source = excluded.source, photo_taken_at = excluded.photo_taken_at,
        photo_taken_at_kind = excluded.photo_taken_at_kind,
        photo_taken_at_source = excluded.photo_taken_at_source,
        imported_at = excluded.imported_at, location_captured_at = excluded.location_captured_at,
        location_time_relation = excluded.location_time_relation, title = excluded.title,
        title_source = excluded.title_source, answers = excluded.answers,
        excerpt = excluded.excerpt, is_draft = excluded.is_draft, is_new = excluded.is_new,
        follow_up_enabled = excluded.follow_up_enabled,
        changed_revision = v_next_revision, deleted_at = null, updated_at = now();

    elsif v_type = 'record_soft_delete' then
      select to_jsonb(record), record.note_id into v_before, v_note_id
      from public.emotion_records record
      where record.user_id = v_user_id and record.moment_id = v_id and record.deleted_at is null;
      if v_before is null then
        raise exception 'Record was not found or is already deleted' using errcode = 'P0002';
      end if;
      perform public.record_emotion_history(
        v_user_id, 'record', v_id, 'soft_delete', v_before, v_next_revision
      );
      insert into public.emotion_entity_history (
        user_id, entity_type, entity_key, operation, before_data, dataset_revision
      ) select v_user_id, 'followup', followup.id, 'soft_delete', to_jsonb(followup), v_next_revision
        from public.emotion_followups followup
        where followup.user_id = v_user_id and followup.note_id = v_note_id
          and followup.status in ('queued', 'active') and followup.deleted_at is null;
      update public.emotion_followups set
        deleted_at = now(), changed_revision = v_next_revision, updated_at = now()
      where user_id = v_user_id and note_id = v_note_id
        and status in ('queued', 'active') and deleted_at is null;
      insert into public.emotion_entity_history (
        user_id, entity_type, entity_key, operation, before_data, dataset_revision
      ) select v_user_id, 'revisit', revisit.id, 'soft_delete', to_jsonb(revisit), v_next_revision
        from public.emotion_revisits revisit
        where revisit.user_id = v_user_id and revisit.note_id = v_note_id and revisit.deleted_at is null;
      update public.emotion_revisits set
        deleted_at = now(), changed_revision = v_next_revision, updated_at = now()
      where user_id = v_user_id and note_id = v_note_id and deleted_at is null;
      insert into public.emotion_entity_history (
        user_id, entity_type, entity_key, operation, before_data, dataset_revision
      ) select v_user_id, 'message', message.conversation_id || '/' || message.id,
          'update', to_jsonb(message), v_next_revision
        from public.emotion_messages message
        where message.user_id = v_user_id and message.deleted_at is null
          and message.note_ids ? v_note_id;
      update public.emotion_messages message set
        note_ids = coalesce((
          select jsonb_agg(item.value order by item.ordinality)
          from jsonb_array_elements(message.note_ids) with ordinality item(value, ordinality)
          where item.value #>> '{}' <> v_note_id
        ), '[]'::jsonb),
        changed_revision = v_next_revision,
        db_updated_at = now()
      where message.user_id = v_user_id and message.deleted_at is null
        and message.note_ids ? v_note_id;
      update public.emotion_messages message set
        deleted_at = now(), changed_revision = v_next_revision, db_updated_at = now()
      where message.user_id = v_user_id and message.deleted_at is null
        and message.follow_up_id in (
          select followup.id from public.emotion_followups followup
          where followup.user_id = v_user_id and followup.note_id = v_note_id
        );
      update public.emotion_records set
        deleted_at = now(), changed_revision = v_next_revision, updated_at = now()
      where user_id = v_user_id and moment_id = v_id;

    elsif v_type = 'conversation_upsert' then
      if coalesce(v_payload ->> 'id', '') <> v_id
        or jsonb_typeof(v_payload -> 'id') <> 'string'
        or not public.emotion_json_integer_is_valid(
          v_payload -> 'sortOrder', 0, 2147483647
        )
        or jsonb_typeof(v_payload -> 'title') <> 'string'
        or char_length(coalesce(v_payload ->> 'title', '')) > 500
        or coalesce(v_payload ->> 'kind', '') not in ('regular', 'companion')
        or (v_payload ? 'unread' and jsonb_typeof(v_payload -> 'unread') <> 'boolean')
        or (v_payload ? 'proactive' and jsonb_typeof(v_payload -> 'proactive') <> 'boolean')
        or v_payload ? 'preview' then
        raise exception 'Invalid conversation payload' using errcode = '22023';
      end if;
      select to_jsonb(conversation) into v_before
      from public.emotion_conversations conversation
      where conversation.user_id = v_user_id and conversation.id = v_id;
      if v_before is not null then
        perform public.record_emotion_history(
          v_user_id, 'conversation', v_id, 'update', v_before, v_next_revision
        );
      end if;
      insert into public.emotion_conversations (
        user_id, id, sort_order, title, badge, unread, proactive, kind,
        changed_revision, deleted_at, updated_at
      ) values (
        v_user_id, v_id, (v_payload ->> 'sortOrder')::integer,
        coalesce(v_payload ->> 'title', ''), nullif(v_payload ->> 'badge', ''),
        coalesce((v_payload ->> 'unread')::boolean, false),
        coalesce((v_payload ->> 'proactive')::boolean, false),
        v_payload ->> 'kind', v_next_revision, null, now()
      ) on conflict (user_id, id) do update set
        sort_order = excluded.sort_order, title = excluded.title, badge = excluded.badge,
        unread = excluded.unread, proactive = excluded.proactive, kind = excluded.kind,
        changed_revision = v_next_revision, deleted_at = null, updated_at = now();

    elsif v_type = 'conversation_soft_delete' then
      select to_jsonb(conversation) into v_before
      from public.emotion_conversations conversation
      where conversation.user_id = v_user_id and conversation.id = v_id
        and conversation.deleted_at is null;
      if v_before is null then
        raise exception 'Conversation was not found or is already deleted' using errcode = 'P0002';
      end if;
      perform public.record_emotion_history(
        v_user_id, 'conversation', v_id, 'soft_delete', v_before, v_next_revision
      );
      insert into public.emotion_entity_history (
        user_id, entity_type, entity_key, operation, before_data, dataset_revision
      ) select v_user_id, 'message', message.conversation_id || '/' || message.id,
          'soft_delete', to_jsonb(message), v_next_revision
        from public.emotion_messages message
        where message.user_id = v_user_id and message.conversation_id = v_id
          and message.deleted_at is null;
      update public.emotion_messages set
        deleted_at = now(), changed_revision = v_next_revision, db_updated_at = now()
      where user_id = v_user_id and conversation_id = v_id and deleted_at is null;
      update public.emotion_conversations set
        deleted_at = now(), changed_revision = v_next_revision, updated_at = now()
      where user_id = v_user_id and id = v_id;

    elsif v_type = 'message_upsert' then
      if char_length(v_parent_id) not between 1 and 200
        or coalesce(v_payload ->> 'conversationId', '') <> v_parent_id
        or coalesce(v_payload ->> 'id', '') <> v_id
        or not public.emotion_json_integer_is_valid(
          v_payload -> 'sortOrder', 0, 2147483647
        )
        or coalesce(v_payload ->> 'role', '') not in ('user', 'assistant')
        or jsonb_typeof(v_payload -> 'body') <> 'string'
        or char_length(coalesce(v_payload ->> 'body', '')) > 20000
        or coalesce(v_payload ->> 'kind', 'message') not in (
          'message', 'clarification', 'followup_prompt', 'followup_answer', 'followup_reply'
        )
        or coalesce(v_payload ->> 'deliveryState', '') = 'pending'
        or (v_payload ->> 'deliveryState') is not null
          and (v_payload ->> 'deliveryState') not in ('delivered', 'failed', 'stopped')
        or (v_payload ? 'retryable' and jsonb_typeof(v_payload -> 'retryable') <> 'boolean')
        or not coalesce(public.emotion_message_metadata_is_valid(
          coalesce(v_payload -> 'noteIds', '[]'::jsonb),
          coalesce(v_payload -> 'externalEvidence', '[]'::jsonb),
          coalesce(v_payload -> 'mcpCalls', '[]'::jsonb),
          coalesce(v_payload -> 'options', '[]'::jsonb),
          coalesce(v_payload -> 'clarificationOptions', '[]'::jsonb),
          v_payload -> 'referenceConfirmation'
        ), false) then
        raise exception 'Invalid message payload' using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.emotion_conversations conversation
        where conversation.user_id = v_user_id and conversation.id = v_parent_id
          and conversation.deleted_at is null
      ) then raise exception 'Parent conversation is missing' using errcode = '23503'; end if;
      v_note_ids := coalesce(v_payload -> 'noteIds', '[]'::jsonb);
      if exists (
        select 1 from jsonb_array_elements_text(v_note_ids) note_id
        where not exists (
          select 1 from public.emotion_records record
          where record.user_id = v_user_id and record.note_id = note_id
            and record.deleted_at is null
        )
      ) then raise exception 'Message contains an invalid note reference' using errcode = '23503'; end if;
      if nullif(v_payload ->> 'followUpId', '') is not null and not exists (
        select 1 from public.emotion_followups followup
        where followup.user_id = v_user_id and followup.id = v_payload ->> 'followUpId'
          and followup.deleted_at is null
      ) then raise exception 'Message contains an invalid follow-up reference' using errcode = '23503'; end if;
      select to_jsonb(message) into v_before from public.emotion_messages message
      where message.user_id = v_user_id and message.conversation_id = v_parent_id
        and message.id = v_id;
      if v_before is not null then
        perform public.record_emotion_history(
          v_user_id, 'message', v_parent_id || '/' || v_id,
          'update', v_before, v_next_revision
        );
      end if;
      insert into public.emotion_messages (
        user_id, conversation_id, id, sort_order, role, body, kind, note_ids,
        external_evidence, mcp_calls, options, clarification_options, request_id,
        reply_to_request_id, delivery_state, retryable, reference_confirmation,
        follow_up_id, created_at, changed_revision, deleted_at, db_updated_at
      ) values (
        v_user_id, v_parent_id, v_id, (v_payload ->> 'sortOrder')::integer,
        v_payload ->> 'role', coalesce(v_payload ->> 'body', ''),
        coalesce(v_payload ->> 'kind', 'message'), v_note_ids,
        coalesce(v_payload -> 'externalEvidence', '[]'::jsonb),
        coalesce(v_payload -> 'mcpCalls', '[]'::jsonb),
        coalesce(v_payload -> 'options', '[]'::jsonb),
        coalesce(v_payload -> 'clarificationOptions', '[]'::jsonb),
        nullif(v_payload ->> 'requestId', ''), nullif(v_payload ->> 'replyToRequestId', ''),
        nullif(v_payload ->> 'deliveryState', ''),
        coalesce((v_payload ->> 'retryable')::boolean, false),
        v_payload -> 'referenceConfirmation', nullif(v_payload ->> 'followUpId', ''),
        nullif(v_payload ->> 'createdAt', '')::timestamptz,
        v_next_revision, null, now()
      ) on conflict (user_id, conversation_id, id) do update set
        sort_order = excluded.sort_order, role = excluded.role, body = excluded.body,
        kind = excluded.kind, note_ids = excluded.note_ids,
        external_evidence = excluded.external_evidence, mcp_calls = excluded.mcp_calls,
        options = excluded.options, clarification_options = excluded.clarification_options,
        request_id = excluded.request_id, reply_to_request_id = excluded.reply_to_request_id,
        delivery_state = excluded.delivery_state, retryable = excluded.retryable,
        reference_confirmation = excluded.reference_confirmation,
        follow_up_id = excluded.follow_up_id, created_at = excluded.created_at,
        changed_revision = v_next_revision, deleted_at = null, db_updated_at = now();

    elsif v_type = 'message_soft_delete' then
      select to_jsonb(message) into v_before from public.emotion_messages message
      where message.user_id = v_user_id and message.conversation_id = v_parent_id
        and message.id = v_id and message.deleted_at is null;
      if v_before is null then
        raise exception 'Message was not found or is already deleted' using errcode = 'P0002';
      end if;
      perform public.record_emotion_history(
        v_user_id, 'message', v_parent_id || '/' || v_id,
        'soft_delete', v_before, v_next_revision
      );
      update public.emotion_messages set
        deleted_at = now(), changed_revision = v_next_revision, db_updated_at = now()
      where user_id = v_user_id and conversation_id = v_parent_id and id = v_id;

    elsif v_type = 'followup_upsert' then
      v_note_id := coalesce(v_payload ->> 'noteId', '');
      v_status := coalesce(v_payload ->> 'status', '');
      if coalesce(v_payload ->> 'id', '') <> v_id
        or jsonb_typeof(v_payload -> 'id') <> 'string'
        or jsonb_typeof(v_payload -> 'noteId') <> 'string'
        or char_length(v_note_id) not between 1 and 200
        or not public.emotion_json_integer_is_valid(
          v_payload -> 'sortOrder', 0, 2147483647
        )
        or not public.emotion_json_integer_is_valid(
          v_payload -> 'intervalDays', 1, 365
        )
        or (v_payload ? 'promptVersion' and v_payload -> 'promptVersion' <> 'null'::jsonb
          and not public.emotion_json_integer_is_valid(
            v_payload -> 'promptVersion', 1, 2147483647
          ))
        or jsonb_typeof(v_payload -> 'dueAt') <> 'string'
        or nullif(v_payload ->> 'dueAt', '') is null
        or v_status not in ('queued', 'active', 'answered', 'skipped') then
        raise exception 'Invalid follow-up payload' using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.emotion_records record
        where record.user_id = v_user_id and record.note_id = v_note_id
          and record.deleted_at is null
      ) then raise exception 'Follow-up record is missing' using errcode = '23503'; end if;
      select to_jsonb(followup), followup.status into v_before, v_existing_status
      from public.emotion_followups followup
      where followup.user_id = v_user_id and followup.id = v_id;
      if v_existing_status in ('answered', 'skipped') and v_status in ('queued', 'active') then
        raise exception 'Terminal follow-up cannot be revived' using errcode = '22023';
      end if;
      if v_before is not null then
        perform public.record_emotion_history(
          v_user_id, 'followup', v_id, 'update', v_before, v_next_revision
        );
      end if;
      insert into public.emotion_followups (
        user_id, id, note_id, sort_order, interval_days, due_at, status,
        follow_up_consented_at, prompt_version, prompt, prompted_at,
        response_option_id, answer_command_id, response, response_kind,
        answered_via, answered_at, assistant_reply, seen_at,
        changed_revision, deleted_at, updated_at
      ) values (
        v_user_id, v_id, v_note_id, (v_payload ->> 'sortOrder')::integer,
        (v_payload ->> 'intervalDays')::integer, (v_payload ->> 'dueAt')::timestamptz,
        v_status, nullif(v_payload ->> 'followUpConsentedAt', '')::timestamptz,
        nullif(v_payload ->> 'promptVersion', '')::integer, nullif(v_payload ->> 'prompt', ''),
        nullif(v_payload ->> 'promptedAt', '')::timestamptz,
        nullif(v_payload ->> 'responseOptionId', ''), nullif(v_payload ->> 'answerCommandId', ''),
        nullif(v_payload ->> 'response', ''), nullif(v_payload ->> 'responseKind', ''),
        nullif(v_payload ->> 'answeredVia', ''), nullif(v_payload ->> 'answeredAt', '')::timestamptz,
        nullif(v_payload ->> 'assistantReply', ''), nullif(v_payload ->> 'seenAt', '')::timestamptz,
        v_next_revision, null, now()
      ) on conflict (user_id, id) do update set
        note_id = excluded.note_id, sort_order = excluded.sort_order,
        interval_days = excluded.interval_days, due_at = excluded.due_at,
        status = excluded.status, follow_up_consented_at = excluded.follow_up_consented_at,
        prompt_version = excluded.prompt_version, prompt = excluded.prompt,
        prompted_at = excluded.prompted_at, response_option_id = excluded.response_option_id,
        answer_command_id = excluded.answer_command_id, response = excluded.response,
        response_kind = excluded.response_kind, answered_via = excluded.answered_via,
        answered_at = excluded.answered_at, assistant_reply = excluded.assistant_reply,
        seen_at = excluded.seen_at, changed_revision = v_next_revision,
        deleted_at = null, updated_at = now();

    elsif v_type = 'followup_soft_delete' then
      select to_jsonb(followup) into v_before from public.emotion_followups followup
      where followup.user_id = v_user_id and followup.id = v_id and followup.deleted_at is null;
      if v_before is null then
        raise exception 'Follow-up was not found or is already deleted' using errcode = 'P0002';
      end if;
      perform public.record_emotion_history(
        v_user_id, 'followup', v_id, 'soft_delete', v_before, v_next_revision
      );
      update public.emotion_messages set
        deleted_at = now(), changed_revision = v_next_revision, db_updated_at = now()
      where user_id = v_user_id and follow_up_id = v_id and deleted_at is null;
      update public.emotion_revisits set
        deleted_at = now(), changed_revision = v_next_revision, updated_at = now()
      where user_id = v_user_id and source_follow_up_id = v_id and deleted_at is null;
      update public.emotion_followups set
        deleted_at = now(), changed_revision = v_next_revision, updated_at = now()
      where user_id = v_user_id and id = v_id;

    elsif v_type = 'revisit_upsert' then
      v_note_id := coalesce(v_payload ->> 'noteId', '');
      if coalesce(v_payload ->> 'id', '') <> v_id
        or jsonb_typeof(v_payload -> 'id') <> 'string'
        or jsonb_typeof(v_payload -> 'noteId') <> 'string'
        or char_length(v_note_id) not between 1 and 200
        or not public.emotion_json_integer_is_valid(
          v_payload -> 'sortOrder', 0, 2147483647
        )
        or coalesce(v_payload ->> 'changeDirection', '') not in ('lighter', 'stronger', 'different', 'same')
        or jsonb_typeof(v_payload -> 'originalOccurredAt') <> 'string'
        or jsonb_typeof(v_payload -> 'revisitedAt') <> 'string'
        or nullif(v_payload ->> 'originalOccurredAt', '') is null
        or nullif(v_payload ->> 'revisitedAt', '') is null then
        raise exception 'Invalid revisit payload' using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.emotion_records record
        where record.user_id = v_user_id and record.note_id = v_note_id
          and record.deleted_at is null
      ) then raise exception 'Revisit record is missing' using errcode = '23503'; end if;
      if nullif(v_payload ->> 'sourceFollowUpId', '') is not null and not exists (
        select 1 from public.emotion_followups followup
        where followup.user_id = v_user_id and followup.id = v_payload ->> 'sourceFollowUpId'
      ) then raise exception 'Revisit follow-up is missing' using errcode = '23503'; end if;
      select to_jsonb(revisit) into v_before from public.emotion_revisits revisit
      where revisit.user_id = v_user_id and revisit.id = v_id;
      if v_before is not null then
        perform public.record_emotion_history(
          v_user_id, 'revisit', v_id, 'update', v_before, v_next_revision
        );
      end if;
      insert into public.emotion_revisits (
        user_id, id, note_id, sort_order, original_emotion, change_direction,
        current_emotion, original_occurred_at, revisited_at, source_follow_up_id,
        changed_revision, deleted_at, updated_at
      ) values (
        v_user_id, v_id, v_note_id, (v_payload ->> 'sortOrder')::integer,
        nullif(v_payload ->> 'originalEmotion', ''), v_payload ->> 'changeDirection',
        nullif(v_payload ->> 'currentEmotion', ''),
        (v_payload ->> 'originalOccurredAt')::timestamptz,
        (v_payload ->> 'revisitedAt')::timestamptz,
        nullif(v_payload ->> 'sourceFollowUpId', ''), v_next_revision, null, now()
      ) on conflict (user_id, id) do update set
        note_id = excluded.note_id, sort_order = excluded.sort_order,
        original_emotion = excluded.original_emotion,
        change_direction = excluded.change_direction,
        current_emotion = excluded.current_emotion,
        original_occurred_at = excluded.original_occurred_at,
        revisited_at = excluded.revisited_at,
        source_follow_up_id = excluded.source_follow_up_id,
        changed_revision = v_next_revision, deleted_at = null, updated_at = now();

    elsif v_type = 'revisit_soft_delete' then
      select to_jsonb(revisit) into v_before from public.emotion_revisits revisit
      where revisit.user_id = v_user_id and revisit.id = v_id and revisit.deleted_at is null;
      if v_before is null then
        raise exception 'Revisit was not found or is already deleted' using errcode = 'P0002';
      end if;
      perform public.record_emotion_history(
        v_user_id, 'revisit', v_id, 'soft_delete', v_before, v_next_revision
      );
      update public.emotion_revisits set
        deleted_at = now(), changed_revision = v_next_revision, updated_at = now()
      where user_id = v_user_id and id = v_id;
    else
      raise exception 'Unsupported emotion mutation type: %', v_type using errcode = '22023';
    end if;
  end loop;

  if (select count(*) from public.emotion_followups followup
      where followup.user_id = v_user_id and followup.status = 'active'
        and followup.deleted_at is null) > 1 then
    raise exception 'Only one active follow-up is allowed' using errcode = '23505';
  end if;

  update public.emotion_settings set
    dataset_revision = v_next_revision,
    changed_revision = v_next_revision,
    data_model_version = 2,
    updated_at = now()
  where user_id = v_user_id;

  return query select true, v_next_revision, null::jsonb;
end;
$$;

revoke all on function public.apply_emotion_mutations(bigint, jsonb)
  from public, anon;
grant execute on function public.apply_emotion_mutations(bigint, jsonb)
  to authenticated;

create or replace function public.migrate_emotion_archive_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_schema_version integer;
  v_archive_revision bigint;
  v_record_count bigint;
  v_conversation_count bigint;
  v_message_count bigint;
  v_followup_count bigint;
  v_revisit_count bigint;
  v_record_ids text;
  v_conversation_ids text;
  v_message_ids text;
  v_followup_ids text;
  v_revisit_ids text;
  v_new_record_ids text;
  v_new_conversation_ids text;
  v_new_message_ids text;
  v_new_followup_ids text;
  v_new_revisit_ids text;
  v_source_semantic jsonb;
  v_new_semantic jsonb;
  v_source_checksum text;
  v_new_checksum text;
  v_verification jsonb;
begin
  select archive.payload, archive.schema_version, archive.revision
  into v_payload, v_schema_version, v_archive_revision
  from public.app_states archive
  where archive.user_id = p_user_id;
  if v_payload is null then
    raise exception 'No legacy emotion archive exists for user %', p_user_id;
  end if;
  if exists (
    select 1 from public.emotion_settings settings
    where settings.user_id = p_user_id and settings.migration_verified_at is not null
  ) then
    select settings.migration_verification into v_verification
    from public.emotion_settings settings where settings.user_id = p_user_id;
    return v_verification;
  end if;
  if greatest(v_schema_version, coalesce((v_payload ->> 'schemaVersion')::integer, 1)) > 6 then
    raise exception 'Future emotion schema cannot be migrated for user %', p_user_id;
  end if;
  if v_payload ->> 'dataMode' is distinct from 'real' then
    raise exception 'Demo emotion archive cannot be migrated for user %', p_user_id;
  end if;
  if coalesce(v_payload ->> 'themeTone', '') not in (
      'original', 'terracotta', 'blue', 'mauve'
    ) or not coalesce(public.emotion_theme_palette_is_valid(
      v_payload -> 'themePalette'
    ), false) then
    raise exception 'Archive theme is invalid for user %', p_user_id;
  end if;
  if jsonb_typeof(coalesce(v_payload -> 'moments', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(v_payload -> 'notes', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(v_payload -> 'conversations', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(v_payload -> 'followUps', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(v_payload -> 'revisits', '[]'::jsonb)) <> 'array' then
    raise exception 'Emotion archive arrays are invalid for user %', p_user_id;
  end if;
  if exists (
    select moment.value ->> 'id'
    from jsonb_array_elements(v_payload -> 'moments') moment(value)
    group by moment.value ->> 'id' having count(*) > 1
  ) or exists (
    select note.value ->> 'id'
    from jsonb_array_elements(v_payload -> 'notes') note(value)
    group by note.value ->> 'id' having count(*) > 1
  ) then raise exception 'Duplicate moment or note ID for user %', p_user_id; end if;
  if exists (
    select conversation.value ->> 'id'
    from jsonb_array_elements(v_payload -> 'conversations') conversation(value)
    group by conversation.value ->> 'id' having count(*) > 1
  ) or exists (
    select followup.value ->> 'id'
    from jsonb_array_elements(v_payload -> 'followUps') followup(value)
    group by followup.value ->> 'id' having count(*) > 1
  ) or exists (
    select revisit.value ->> 'id'
    from jsonb_array_elements(v_payload -> 'revisits') revisit(value)
    group by revisit.value ->> 'id' having count(*) > 1
  ) or exists (
    select conversation.value ->> 'id', message.value ->> 'id'
    from jsonb_array_elements(v_payload -> 'conversations') conversation(value)
    cross join lateral jsonb_array_elements(
      coalesce(conversation.value -> 'messages', '[]'::jsonb)
    ) message(value)
    where coalesce(message.value ->> 'deliveryState', '') <> 'pending'
    group by conversation.value ->> 'id', message.value ->> 'id'
    having count(*) > 1
  ) then
    raise exception 'Duplicate conversation, message, follow-up, or revisit ID for user %', p_user_id;
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_payload -> 'moments') moment(value)
    where not exists (
      select 1 from jsonb_array_elements(v_payload -> 'notes') note(value)
      where note.value ->> 'id' = moment.value ->> 'noteId'
    )
  ) or exists (
    select 1 from jsonb_array_elements(v_payload -> 'notes') note(value)
    where not exists (
      select 1 from jsonb_array_elements(v_payload -> 'moments') moment(value)
      where moment.value ->> 'noteId' = note.value ->> 'id'
    )
  ) then raise exception 'Missing moment-note pair for user %', p_user_id; end if;
  if exists (
    select 1
    from jsonb_array_elements(v_payload -> 'moments') moment(value)
    join jsonb_array_elements(v_payload -> 'notes') note(value)
      on note.value ->> 'id' = moment.value ->> 'noteId'
    where jsonb_build_array(
      coalesce(moment.value ->> 'place', ''), moment.value -> 'emotion',
      moment.value -> 'placeRating', moment.value -> 'color',
      coalesce(moment.value ->> 'localDate', moment.value ->> 'date'),
      coalesce(moment.value ->> 'localTime', moment.value ->> 'time'),
      moment.value -> 'occurredAtUtc', moment.value -> 'timeZone',
      moment.value -> 'utcOffsetMinutes', moment.value -> 'timePrecision',
      moment.value -> 'eventTimeSource'
    ) is distinct from jsonb_build_array(
      coalesce(note.value ->> 'place', ''), note.value -> 'emotion',
      note.value -> 'placeRating', note.value -> 'color',
      coalesce(note.value ->> 'localDate', note.value ->> 'date'),
      coalesce(note.value ->> 'localTime', note.value ->> 'time'),
      note.value -> 'occurredAtUtc', note.value -> 'timeZone',
      note.value -> 'utcOffsetMinutes', note.value -> 'timePrecision',
      note.value -> 'eventTimeSource'
    )
  ) then raise exception 'Shared moment-note fields diverge for user %', p_user_id; end if;
  if exists (
    select 1 from jsonb_array_elements(v_payload -> 'followUps') followup(value)
    where not exists (
      select 1 from jsonb_array_elements(v_payload -> 'notes') note(value)
      where note.value ->> 'id' = followup.value ->> 'noteId'
    )
  ) or exists (
    select 1 from jsonb_array_elements(v_payload -> 'revisits') revisit(value)
    where not exists (
      select 1 from jsonb_array_elements(v_payload -> 'notes') note(value)
      where note.value ->> 'id' = revisit.value ->> 'noteId'
    )
  ) then raise exception 'Archive contains an orphan follow-up or revisit for user %', p_user_id; end if;
  if exists (
    select 1
    from jsonb_array_elements(v_payload -> 'conversations') conversation(value)
    cross join lateral jsonb_array_elements(
      coalesce(conversation.value -> 'messages', '[]'::jsonb)
    ) message(value)
    cross join lateral jsonb_array_elements_text(
      coalesce(message.value -> 'noteIds', '[]'::jsonb)
    ) note_id(value)
    where coalesce(message.value ->> 'deliveryState', '') <> 'pending'
      and not exists (
        select 1 from jsonb_array_elements(v_payload -> 'notes') note(value)
        where note.value ->> 'id' = note_id.value
      )
  ) or exists (
    select 1
    from jsonb_array_elements(v_payload -> 'conversations') conversation(value)
    cross join lateral jsonb_array_elements(
      coalesce(conversation.value -> 'messages', '[]'::jsonb)
    ) message(value)
    where coalesce(message.value ->> 'deliveryState', '') <> 'pending'
      and nullif(message.value ->> 'followUpId', '') is not null
      and not exists (
        select 1 from jsonb_array_elements(v_payload -> 'followUps') followup(value)
        where followup.value ->> 'id' = message.value ->> 'followUpId'
      )
  ) or exists (
    select 1 from jsonb_array_elements(v_payload -> 'revisits') revisit(value)
    where nullif(revisit.value ->> 'sourceFollowUpId', '') is not null
      and not exists (
        select 1 from jsonb_array_elements(v_payload -> 'followUps') followup(value)
        where followup.value ->> 'id' = revisit.value ->> 'sourceFollowUpId'
      )
  ) then
    raise exception 'Archive contains an invalid message or revisit reference for user %', p_user_id;
  end if;
  if (select count(*) from jsonb_array_elements(v_payload -> 'followUps') followup(value)
      where followup.value ->> 'status' = 'active') > 1 then
    raise exception 'Archive contains multiple active follow-ups for user %', p_user_id;
  end if;

  insert into public.emotion_settings (
    user_id, dataset_revision, data_model_version, changed_revision,
    theme_tone, theme_palette
  ) values (
    p_user_id, 0, 2, 0,
    case when v_payload ->> 'themeTone' in ('original', 'terracotta', 'blue', 'mauve')
      then v_payload ->> 'themeTone' else 'original' end,
    case when jsonb_typeof(v_payload -> 'themePalette') = 'object'
      then v_payload -> 'themePalette'
      else '{"page":"#F3F3F3","card":"#D9D9D9","icon":"#C3C3C3","dark":"#5C5C5C"}'::jsonb end
  ) on conflict (user_id) do nothing;
  insert into public.emotion_preferences (user_id, profile_name)
  select p_user_id, coalesce(profile.account_id, '')
  from (select 1) seed
  left join public.account_profiles profile on profile.user_id = p_user_id
  on conflict (user_id) do nothing;

  insert into public.emotion_records (
    user_id, moment_id, note_id, sort_order, longitude, latitude, place,
    emotion, intensity, place_rating, color, tag_group_id, tag_order,
    local_date, local_time, occurred_at_utc, time_zone, utc_offset_minutes,
    time_precision, event_time_source, source, photo_taken_at,
    photo_taken_at_kind, photo_taken_at_source, imported_at,
    location_captured_at, location_time_relation, title, title_source,
    answers, excerpt, is_draft, is_new, follow_up_enabled, changed_revision
  )
  select p_user_id, moment.value ->> 'id', note.value ->> 'id',
    (moment.ordinality - 1)::integer,
    (moment.value ->> 'longitude')::double precision,
    (moment.value ->> 'latitude')::double precision,
    coalesce(moment.value ->> 'place', ''), nullif(moment.value ->> 'emotion', ''),
    coalesce((moment.value ->> 'intensity')::integer, 0),
    nullif(moment.value ->> 'placeRating', ''), nullif(moment.value ->> 'color', ''),
    nullif(moment.value ->> 'tagGroupId', '')::bigint,
    nullif(moment.value ->> 'tagOrder', '')::bigint,
    coalesce(moment.value ->> 'localDate', moment.value ->> 'date'),
    coalesce(moment.value ->> 'localTime', moment.value ->> 'time'),
    nullif(moment.value ->> 'occurredAtUtc', '')::timestamptz,
    nullif(moment.value ->> 'timeZone', ''),
    nullif(moment.value ->> 'utcOffsetMinutes', '')::integer,
    coalesce(moment.value ->> 'timePrecision', 'minute'),
    coalesce(moment.value ->> 'eventTimeSource', 'legacy'),
    nullif(moment.value ->> 'source', ''), nullif(moment.value ->> 'photoTakenAt', ''),
    nullif(moment.value ->> 'photoTakenAtKind', ''),
    nullif(moment.value ->> 'photoTakenAtSource', ''),
    nullif(moment.value ->> 'importedAt', '')::timestamptz,
    nullif(moment.value ->> 'locationCapturedAt', '')::timestamptz,
    nullif(moment.value ->> 'locationTimeRelation', ''),
    coalesce(note.value ->> 'title', ''), nullif(note.value ->> 'titleSource', ''),
    coalesce(note.value -> 'answers', '[]'::jsonb), coalesce(note.value ->> 'excerpt', ''),
    coalesce((note.value ->> 'isDraft')::boolean, false),
    coalesce((moment.value ->> 'isNew')::boolean, false),
    coalesce((note.value ->> 'followUpEnabled')::boolean, false), 0
  from jsonb_array_elements(v_payload -> 'moments') with ordinality moment(value, ordinality)
  join jsonb_array_elements(v_payload -> 'notes') note(value)
    on note.value ->> 'id' = moment.value ->> 'noteId'
  on conflict (user_id, moment_id) do nothing;

  insert into public.emotion_conversations (
    user_id, id, sort_order, title, badge, unread, proactive, kind, changed_revision
  ) select p_user_id, conversation.value ->> 'id',
      (conversation.ordinality - 1)::integer,
      coalesce(conversation.value ->> 'title', ''), nullif(conversation.value ->> 'badge', ''),
      coalesce((conversation.value ->> 'unread')::boolean, false),
      coalesce((conversation.value ->> 'proactive')::boolean, false),
      case when conversation.value ->> 'kind' = 'companion' then 'companion' else 'regular' end,
      0
    from jsonb_array_elements(v_payload -> 'conversations') with ordinality conversation(value, ordinality)
  on conflict (user_id, id) do nothing;

  insert into public.emotion_followups (
    user_id, id, note_id, sort_order, interval_days, due_at, status,
    follow_up_consented_at, prompt_version, prompt, prompted_at,
    response_option_id, answer_command_id, response, response_kind,
    answered_via, answered_at, assistant_reply, seen_at, changed_revision
  ) select p_user_id, followup.value ->> 'id', followup.value ->> 'noteId',
      (followup.ordinality - 1)::integer, (followup.value ->> 'intervalDays')::integer,
      (followup.value ->> 'dueAt')::timestamptz, followup.value ->> 'status',
      nullif(followup.value ->> 'followUpConsentedAt', '')::timestamptz,
      nullif(followup.value ->> 'promptVersion', '')::integer,
      nullif(followup.value ->> 'prompt', ''),
      nullif(followup.value ->> 'promptedAt', '')::timestamptz,
      nullif(followup.value ->> 'responseOptionId', ''),
      nullif(followup.value ->> 'answerCommandId', ''),
      nullif(followup.value ->> 'response', ''), nullif(followup.value ->> 'responseKind', ''),
      nullif(followup.value ->> 'answeredVia', ''),
      nullif(followup.value ->> 'answeredAt', '')::timestamptz,
      nullif(followup.value ->> 'assistantReply', ''),
      nullif(followup.value ->> 'seenAt', '')::timestamptz, 0
    from jsonb_array_elements(v_payload -> 'followUps') with ordinality followup(value, ordinality)
  on conflict (user_id, id) do nothing;

  insert into public.emotion_revisits (
    user_id, id, note_id, sort_order, original_emotion, change_direction,
    current_emotion, original_occurred_at, revisited_at, source_follow_up_id,
    changed_revision
  ) select p_user_id, revisit.value ->> 'id', revisit.value ->> 'noteId',
      (revisit.ordinality - 1)::integer, nullif(revisit.value ->> 'originalEmotion', ''),
      revisit.value ->> 'changeDirection', nullif(revisit.value ->> 'currentEmotion', ''),
      (revisit.value ->> 'originalOccurredAt')::timestamptz,
      (revisit.value ->> 'revisitedAt')::timestamptz,
      nullif(revisit.value ->> 'sourceFollowUpId', ''), 0
    from jsonb_array_elements(v_payload -> 'revisits') with ordinality revisit(value, ordinality)
  on conflict (user_id, id) do nothing;

  insert into public.emotion_messages (
    user_id, conversation_id, id, sort_order, role, body, kind, note_ids,
    external_evidence, mcp_calls, options, clarification_options, request_id,
    reply_to_request_id, delivery_state, retryable, reference_confirmation,
    follow_up_id, created_at, changed_revision
  ) select p_user_id, conversation.value ->> 'id', message.value ->> 'id',
      (message.ordinality - 1)::integer, message.value ->> 'role',
      coalesce(message.value ->> 'body', ''), coalesce(message.value ->> 'kind', 'message'),
      coalesce(message.value -> 'noteIds', '[]'::jsonb),
      coalesce(message.value -> 'externalEvidence', '[]'::jsonb),
      coalesce(message.value -> 'mcpCalls', '[]'::jsonb),
      coalesce(message.value -> 'options', '[]'::jsonb),
      coalesce(message.value -> 'clarificationOptions', '[]'::jsonb),
      nullif(message.value ->> 'requestId', ''),
      nullif(message.value ->> 'replyToRequestId', ''),
      nullif(message.value ->> 'deliveryState', ''),
      coalesce((message.value ->> 'retryable')::boolean, false),
      message.value -> 'referenceConfirmation', nullif(message.value ->> 'followUpId', ''),
      nullif(message.value ->> 'createdAt', '')::timestamptz, 0
    from jsonb_array_elements(v_payload -> 'conversations') conversation(value)
    cross join lateral jsonb_array_elements(coalesce(conversation.value -> 'messages', '[]'::jsonb))
      with ordinality message(value, ordinality)
    where coalesce(message.value ->> 'deliveryState', '') <> 'pending'
  on conflict (user_id, conversation_id, id) do nothing;

  select jsonb_array_length(v_payload -> 'moments'),
    jsonb_array_length(v_payload -> 'conversations'),
    (
      select count(*)
      from jsonb_array_elements(v_payload -> 'conversations') conversation(value)
      cross join lateral jsonb_array_elements(
        coalesce(conversation.value -> 'messages', '[]'::jsonb)
      ) message(value)
      where coalesce(message.value ->> 'deliveryState', '') <> 'pending'
    ),
    jsonb_array_length(v_payload -> 'followUps'),
    jsonb_array_length(v_payload -> 'revisits')
  into v_record_count, v_conversation_count, v_message_count,
    v_followup_count, v_revisit_count;

  select md5(coalesce(string_agg(moment.value ->> 'id', E'\n' order by moment.ordinality), ''))
  into v_record_ids
  from jsonb_array_elements(v_payload -> 'moments')
    with ordinality moment(value, ordinality);
  select md5(coalesce(string_agg(conversation.value ->> 'id', E'\n' order by conversation.ordinality), ''))
  into v_conversation_ids
  from jsonb_array_elements(v_payload -> 'conversations')
    with ordinality conversation(value, ordinality);
  select md5(coalesce(string_agg(
      (conversation.value ->> 'id') || '/' || (message.value ->> 'id'), E'\n'
      order by conversation.ordinality, message.ordinality
    ), ''))
  into v_message_ids
  from jsonb_array_elements(v_payload -> 'conversations')
    with ordinality conversation(value, ordinality)
  cross join lateral jsonb_array_elements(
    coalesce(conversation.value -> 'messages', '[]'::jsonb)
  ) with ordinality message(value, ordinality)
  where coalesce(message.value ->> 'deliveryState', '') <> 'pending';
  select md5(coalesce(string_agg(followup.value ->> 'id', E'\n' order by followup.ordinality), ''))
  into v_followup_ids
  from jsonb_array_elements(v_payload -> 'followUps')
    with ordinality followup(value, ordinality);
  select md5(coalesce(string_agg(revisit.value ->> 'id', E'\n' order by revisit.ordinality), ''))
  into v_revisit_ids
  from jsonb_array_elements(v_payload -> 'revisits')
    with ordinality revisit(value, ordinality);

  select md5(coalesce(string_agg(record.moment_id, E'\n' order by record.sort_order, record.moment_id), ''))
  into v_new_record_ids from public.emotion_records record
  where record.user_id = p_user_id and record.deleted_at is null;
  select md5(coalesce(string_agg(conversation.id, E'\n' order by conversation.sort_order, conversation.id), ''))
  into v_new_conversation_ids from public.emotion_conversations conversation
  where conversation.user_id = p_user_id and conversation.deleted_at is null;
  select md5(coalesce(string_agg(
      message.conversation_id || '/' || message.id, E'\n'
      order by conversation.sort_order, message.sort_order, message.id
    ), ''))
  into v_new_message_ids
  from public.emotion_messages message
  join public.emotion_conversations conversation
    on conversation.user_id = message.user_id and conversation.id = message.conversation_id
  where message.user_id = p_user_id and message.deleted_at is null
    and conversation.deleted_at is null;
  select md5(coalesce(string_agg(followup.id, E'\n' order by followup.sort_order, followup.id), ''))
  into v_new_followup_ids from public.emotion_followups followup
  where followup.user_id = p_user_id and followup.deleted_at is null;
  select md5(coalesce(string_agg(revisit.id, E'\n' order by revisit.sort_order, revisit.id), ''))
  into v_new_revisit_ids from public.emotion_revisits revisit
  where revisit.user_id = p_user_id and revisit.deleted_at is null;

  v_source_semantic := jsonb_build_object(
    'archiveSchemaVersion', coalesce((v_payload ->> 'schemaVersion')::integer, v_schema_version),
    'themeTone', v_payload -> 'themeTone',
    'themePalette', v_payload -> 'themePalette',
    'records', (
      select coalesce(jsonb_agg(jsonb_build_array(
        moment.value ->> 'id', note.value ->> 'id', moment.ordinality - 1,
        (moment.value ->> 'longitude')::double precision,
        (moment.value ->> 'latitude')::double precision,
        coalesce(moment.value ->> 'place', ''), moment.value -> 'emotion',
        case when coalesce(moment.value -> 'emotion', 'null'::jsonb) = 'null'::jsonb
          then 0 else coalesce((moment.value ->> 'intensity')::integer, 0) end,
        moment.value -> 'placeRating', moment.value -> 'color',
        moment.value -> 'tagGroupId', moment.value -> 'tagOrder',
        coalesce(moment.value ->> 'localDate', moment.value ->> 'date'),
        coalesce(moment.value ->> 'localTime', moment.value ->> 'time'),
        nullif(moment.value ->> 'occurredAtUtc', '')::timestamptz,
        moment.value -> 'timeZone', moment.value -> 'utcOffsetMinutes',
        coalesce(moment.value ->> 'timePrecision', 'minute'),
        coalesce(moment.value ->> 'eventTimeSource', 'legacy'),
        moment.value -> 'source', moment.value -> 'photoTakenAt',
        moment.value -> 'photoTakenAtKind', moment.value -> 'photoTakenAtSource',
        nullif(moment.value ->> 'importedAt', '')::timestamptz,
        nullif(moment.value ->> 'locationCapturedAt', '')::timestamptz,
        moment.value -> 'locationTimeRelation', coalesce(note.value ->> 'title', ''),
        note.value -> 'titleSource', coalesce(note.value -> 'answers', '[]'::jsonb),
        coalesce(note.value ->> 'excerpt', ''),
        coalesce((note.value ->> 'isDraft')::boolean, false),
        coalesce((moment.value ->> 'isNew')::boolean, false),
        coalesce((note.value ->> 'followUpEnabled')::boolean, false)
      ) order by moment.ordinality), '[]'::jsonb)
      from jsonb_array_elements(v_payload -> 'moments')
        with ordinality moment(value, ordinality)
      join jsonb_array_elements(v_payload -> 'notes') note(value)
        on note.value ->> 'id' = moment.value ->> 'noteId'
    ),
    'conversations', (
      select coalesce(jsonb_agg(jsonb_build_array(
        conversation.value ->> 'id', conversation.ordinality - 1,
        coalesce(conversation.value ->> 'title', ''), conversation.value -> 'badge',
        coalesce((conversation.value ->> 'unread')::boolean, false),
        coalesce((conversation.value ->> 'proactive')::boolean, false),
        case when conversation.value ->> 'kind' = 'companion' then 'companion' else 'regular' end
      ) order by conversation.ordinality), '[]'::jsonb)
      from jsonb_array_elements(v_payload -> 'conversations')
        with ordinality conversation(value, ordinality)
    ),
    'messages', (
      select coalesce(jsonb_agg(jsonb_build_array(
        conversation.value ->> 'id', message.value ->> 'id', message.ordinality - 1,
        message.value ->> 'role', coalesce(message.value ->> 'body', ''),
        coalesce(message.value ->> 'kind', 'message'),
        coalesce(message.value -> 'noteIds', '[]'::jsonb),
        coalesce(message.value -> 'externalEvidence', '[]'::jsonb),
        coalesce(message.value -> 'mcpCalls', '[]'::jsonb),
        coalesce(message.value -> 'options', '[]'::jsonb),
        coalesce(message.value -> 'clarificationOptions', '[]'::jsonb),
        message.value -> 'requestId', message.value -> 'replyToRequestId',
        message.value -> 'deliveryState',
        coalesce((message.value ->> 'retryable')::boolean, false),
        message.value -> 'referenceConfirmation', message.value -> 'followUpId',
        nullif(message.value ->> 'createdAt', '')::timestamptz
      ) order by conversation.ordinality, message.ordinality), '[]'::jsonb)
      from jsonb_array_elements(v_payload -> 'conversations')
        with ordinality conversation(value, ordinality)
      cross join lateral jsonb_array_elements(
        coalesce(conversation.value -> 'messages', '[]'::jsonb)
      ) with ordinality message(value, ordinality)
      where coalesce(message.value ->> 'deliveryState', '') <> 'pending'
    ),
    'followUps', (
      select coalesce(jsonb_agg(jsonb_build_array(
        followup.value ->> 'id', followup.value ->> 'noteId', followup.ordinality - 1,
        (followup.value ->> 'intervalDays')::integer,
        (followup.value ->> 'dueAt')::timestamptz, followup.value ->> 'status',
        nullif(followup.value ->> 'followUpConsentedAt', '')::timestamptz,
        nullif(followup.value ->> 'promptVersion', '')::integer,
        followup.value -> 'prompt', nullif(followup.value ->> 'promptedAt', '')::timestamptz,
        followup.value -> 'responseOptionId', followup.value -> 'answerCommandId',
        followup.value -> 'response', followup.value -> 'responseKind',
        followup.value -> 'answeredVia', nullif(followup.value ->> 'answeredAt', '')::timestamptz,
        followup.value -> 'assistantReply', nullif(followup.value ->> 'seenAt', '')::timestamptz
      ) order by followup.ordinality), '[]'::jsonb)
      from jsonb_array_elements(v_payload -> 'followUps')
        with ordinality followup(value, ordinality)
    ),
    'revisits', (
      select coalesce(jsonb_agg(jsonb_build_array(
        revisit.value ->> 'id', revisit.value ->> 'noteId', revisit.ordinality - 1,
        revisit.value -> 'originalEmotion', revisit.value ->> 'changeDirection',
        revisit.value -> 'currentEmotion',
        (revisit.value ->> 'originalOccurredAt')::timestamptz,
        (revisit.value ->> 'revisitedAt')::timestamptz,
        revisit.value -> 'sourceFollowUpId'
      ) order by revisit.ordinality), '[]'::jsonb)
      from jsonb_array_elements(v_payload -> 'revisits')
        with ordinality revisit(value, ordinality)
    )
  );

  v_new_semantic := jsonb_build_object(
    'archiveSchemaVersion', coalesce((v_payload ->> 'schemaVersion')::integer, v_schema_version),
    'themeTone', (
      select to_jsonb(settings.theme_tone) from public.emotion_settings settings
      where settings.user_id = p_user_id
    ),
    'themePalette', (
      select settings.theme_palette from public.emotion_settings settings
      where settings.user_id = p_user_id
    ),
    'records', (
      select coalesce(jsonb_agg(jsonb_build_array(
        record.moment_id, record.note_id, record.sort_order,
        record.longitude, record.latitude, record.place, to_jsonb(record.emotion),
        record.intensity, to_jsonb(record.place_rating), to_jsonb(record.color),
        to_jsonb(record.tag_group_id), to_jsonb(record.tag_order),
        record.local_date, record.local_time, record.occurred_at_utc,
        to_jsonb(record.time_zone), to_jsonb(record.utc_offset_minutes),
        record.time_precision, record.event_time_source, to_jsonb(record.source),
        to_jsonb(record.photo_taken_at), to_jsonb(record.photo_taken_at_kind),
        to_jsonb(record.photo_taken_at_source), record.imported_at,
        record.location_captured_at, to_jsonb(record.location_time_relation),
        record.title, to_jsonb(record.title_source), record.answers, record.excerpt,
        record.is_draft, record.is_new, record.follow_up_enabled
      ) order by record.sort_order, record.moment_id), '[]'::jsonb)
      from public.emotion_records record
      where record.user_id = p_user_id and record.deleted_at is null
    ),
    'conversations', (
      select coalesce(jsonb_agg(jsonb_build_array(
        conversation.id, conversation.sort_order, conversation.title,
        to_jsonb(conversation.badge), conversation.unread, conversation.proactive,
        conversation.kind
      ) order by conversation.sort_order, conversation.id), '[]'::jsonb)
      from public.emotion_conversations conversation
      where conversation.user_id = p_user_id and conversation.deleted_at is null
    ),
    'messages', (
      select coalesce(jsonb_agg(jsonb_build_array(
        message.conversation_id, message.id, message.sort_order, message.role,
        message.body, message.kind, message.note_ids, message.external_evidence,
        message.mcp_calls, message.options, message.clarification_options,
        to_jsonb(message.request_id), to_jsonb(message.reply_to_request_id),
        to_jsonb(message.delivery_state), message.retryable,
        message.reference_confirmation, to_jsonb(message.follow_up_id), message.created_at
      ) order by conversation.sort_order, message.sort_order, message.id), '[]'::jsonb)
      from public.emotion_messages message
      join public.emotion_conversations conversation
        on conversation.user_id = message.user_id and conversation.id = message.conversation_id
      where message.user_id = p_user_id and message.deleted_at is null
        and conversation.deleted_at is null
    ),
    'followUps', (
      select coalesce(jsonb_agg(jsonb_build_array(
        followup.id, followup.note_id, followup.sort_order, followup.interval_days,
        followup.due_at, followup.status, followup.follow_up_consented_at,
        followup.prompt_version, to_jsonb(followup.prompt), followup.prompted_at,
        to_jsonb(followup.response_option_id), to_jsonb(followup.answer_command_id),
        to_jsonb(followup.response), to_jsonb(followup.response_kind),
        to_jsonb(followup.answered_via), followup.answered_at,
        to_jsonb(followup.assistant_reply), followup.seen_at
      ) order by followup.sort_order, followup.id), '[]'::jsonb)
      from public.emotion_followups followup
      where followup.user_id = p_user_id and followup.deleted_at is null
    ),
    'revisits', (
      select coalesce(jsonb_agg(jsonb_build_array(
        revisit.id, revisit.note_id, revisit.sort_order,
        to_jsonb(revisit.original_emotion), revisit.change_direction,
        to_jsonb(revisit.current_emotion), revisit.original_occurred_at,
        revisit.revisited_at, to_jsonb(revisit.source_follow_up_id)
      ) order by revisit.sort_order, revisit.id), '[]'::jsonb)
      from public.emotion_revisits revisit
      where revisit.user_id = p_user_id and revisit.deleted_at is null
    )
  );

  v_source_checksum := md5(v_source_semantic::text);
  v_new_checksum := md5(v_new_semantic::text);
  v_verification := jsonb_build_object(
    'archiveRevision', v_archive_revision,
    'archiveSchemaVersion', coalesce((v_payload ->> 'schemaVersion')::integer, v_schema_version),
    'recordCount', v_record_count,
    'conversationCount', v_conversation_count,
    'messageCount', v_message_count,
    'followUpCount', v_followup_count,
    'revisitCount', v_revisit_count,
    'recordIdsChecksum', v_record_ids,
    'conversationIdsChecksum', v_conversation_ids,
    'messageIdsChecksum', v_message_ids,
    'followUpIdsChecksum', v_followup_ids,
    'revisitIdsChecksum', v_revisit_ids,
    'sourceSemanticChecksum', v_source_checksum,
    'normalizedSemanticChecksum', v_new_checksum,
    'idsMatch', v_record_ids = v_new_record_ids
      and v_conversation_ids = v_new_conversation_ids
      and v_message_ids = v_new_message_ids
      and v_followup_ids = v_new_followup_ids
      and v_revisit_ids = v_new_revisit_ids,
    'sortOrderMatch', v_record_ids = v_new_record_ids
      and v_conversation_ids = v_new_conversation_ids
      and v_message_ids = v_new_message_ids
      and v_followup_ids = v_new_followup_ids
      and v_revisit_ids = v_new_revisit_ids,
    'semanticChecksumMatch', v_source_checksum = v_new_checksum,
    'orphanCount', 0,
    'duplicateCount', 0,
    'futureSchemaCount', 0,
    'pendingMessagesExcluded', (
      select count(*)
      from jsonb_array_elements(v_payload -> 'conversations') conversation(value)
      cross join lateral jsonb_array_elements(
        coalesce(conversation.value -> 'messages', '[]'::jsonb)
      ) message(value)
      where message.value ->> 'deliveryState' = 'pending'
    )
  );

  if (select count(*) from public.emotion_records record
      where record.user_id = p_user_id and record.deleted_at is null) <> v_record_count
    or (select count(*) from public.emotion_conversations conversation
      where conversation.user_id = p_user_id and conversation.deleted_at is null) <> v_conversation_count
    or (select count(*) from public.emotion_messages message
      where message.user_id = p_user_id and message.deleted_at is null) <> v_message_count
    or (select count(*) from public.emotion_followups followup
      where followup.user_id = p_user_id and followup.deleted_at is null) <> v_followup_count
    or (select count(*) from public.emotion_revisits revisit
      where revisit.user_id = p_user_id and revisit.deleted_at is null) <> v_revisit_count
    or not coalesce((v_verification ->> 'idsMatch')::boolean, false)
    or not coalesce((v_verification ->> 'sortOrderMatch')::boolean, false)
    or v_source_checksum is distinct from v_new_checksum then
    raise exception 'Normalized emotion migration verification failed for user %', p_user_id;
  end if;

  update public.emotion_settings set
    data_model_version = 2,
    migration_verified_at = now(),
    migration_verification = v_verification,
    updated_at = now()
  where user_id = p_user_id;

  return v_verification;
end;
$$;

revoke all on function public.migrate_emotion_archive_user(uuid)
  from public, anon, authenticated;
grant execute on function public.migrate_emotion_archive_user(uuid)
  to service_role;

do $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select archive.user_id
    from public.app_states archive
    left join public.emotion_settings settings on settings.user_id = archive.user_id
    where settings.migration_verified_at is null
    order by archive.user_id
  loop
    perform public.migrate_emotion_archive_user(v_user_id);
  end loop;
end;
$$;

commit;
