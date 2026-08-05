-- Add the remaining account-owned settings to normalized cloud sync.
-- Historical migrations remain untouched. Avatar content stays private under
-- the existing owner-only RLS policy and is redacted from mutation history.

begin;

alter table public.emotion_preferences
  add column if not exists avatar_data_url text not null default '',
  add column if not exists language text not null default 'zh';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'emotion_preferences_avatar_data_url_valid'
      and conrelid = 'public.emotion_preferences'::regclass
  ) then
    alter table public.emotion_preferences
      add constraint emotion_preferences_avatar_data_url_valid check (
        char_length(avatar_data_url) <= 165000
        and (
          avatar_data_url = ''
          or avatar_data_url ~* '^data:image/(webp|png|jpeg);base64,'
        )
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'emotion_preferences_language_valid'
      and conrelid = 'public.emotion_preferences'::regclass
  ) then
    alter table public.emotion_preferences
      add constraint emotion_preferences_language_valid
      check (language in ('zh', 'en', 'ko'));
  end if;
end;
$$;

create or replace function public.redact_emotion_preference_history_media()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.entity_type = 'preferences'
    and jsonb_typeof(new.before_data) = 'object' then
    new.before_data := new.before_data - 'avatar_data_url';
  end if;
  return new;
end;
$$;

drop trigger if exists redact_emotion_preference_history_media
  on public.emotion_entity_history;
create trigger redact_emotion_preference_history_media
before insert on public.emotion_entity_history
for each row execute function public.redact_emotion_preference_history_media();

-- Preserve the reviewed v2 mutation engine as the atomic core. The wrapper
-- removes the two new fields before invoking it, then writes those fields in
-- the same transaction and at the same dataset revision. Older clients that
-- omit the new fields remain compatible and preserve their cloud values.
do $$
begin
  if to_regprocedure(
    'public.apply_emotion_mutations_v2_core(bigint,jsonb)'
  ) is null then
    alter function public.apply_emotion_mutations(bigint, jsonb)
      rename to apply_emotion_mutations_v2_core;
  end if;
end;
$$;

revoke all on function public.apply_emotion_mutations_v2_core(bigint, jsonb)
  from public, anon, authenticated;

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
  v_core_mutations jsonb;
  v_preferences_payload jsonb;
  v_saved boolean;
  v_revision bigint;
  v_conflict jsonb;
begin
  if p_mutations is null or jsonb_typeof(p_mutations) <> 'array'
    or jsonb_array_length(p_mutations) not between 1 and 500 then
    raise exception 'Mutation batch size must be between 1 and 500'
      using errcode = '22023';
  end if;

  select item.value -> 'payload'
  into v_preferences_payload
  from jsonb_array_elements(p_mutations) with ordinality item(value, position)
  where item.value ->> 'type' = 'preferences_update'
  order by item.position desc
  limit 1;

  if v_preferences_payload is not null then
    if v_preferences_payload ? 'avatarSrc' and (
      jsonb_typeof(v_preferences_payload -> 'avatarSrc') <> 'string'
      or char_length(v_preferences_payload ->> 'avatarSrc') > 165000
      or (
        coalesce(v_preferences_payload ->> 'avatarSrc', '') <> ''
        and coalesce(v_preferences_payload ->> 'avatarSrc', '')
          !~* '^data:image/(webp|png|jpeg);base64,'
      )
    ) then
      raise exception 'Invalid avatar preference' using errcode = '22023';
    end if;
    if v_preferences_payload ? 'language' and (
      jsonb_typeof(v_preferences_payload -> 'language') <> 'string'
      or coalesce(v_preferences_payload ->> 'language', '')
        not in ('zh', 'en', 'ko')
    ) then
      raise exception 'Invalid language preference' using errcode = '22023';
    end if;
  end if;

  select jsonb_agg(
    case
      when item.value ->> 'type' = 'preferences_update' then
        jsonb_set(
          item.value,
          '{payload}',
          coalesce(item.value -> 'payload', '{}'::jsonb)
            - 'avatarSrc' - 'language'
        )
      else item.value
    end
    order by item.position
  )
  into v_core_mutations
  from jsonb_array_elements(p_mutations) with ordinality item(value, position);

  select result.saved, result.dataset_revision, result.conflict
  into v_saved, v_revision, v_conflict
  from public.apply_emotion_mutations_v2_core(
    p_expected_revision,
    v_core_mutations
  ) result;

  if v_saved and v_preferences_payload is not null then
    update public.emotion_preferences set
      avatar_data_url = case
        when v_preferences_payload ? 'avatarSrc'
          then coalesce(v_preferences_payload ->> 'avatarSrc', '')
        else avatar_data_url
      end,
      language = case
        when v_preferences_payload ? 'language'
          then v_preferences_payload ->> 'language'
        else language
      end,
      changed_revision = v_revision,
      updated_at = now()
    where user_id = auth.uid();
  end if;

  return query select v_saved, v_revision, v_conflict;
end;
$$;

revoke all on function public.apply_emotion_mutations(bigint, jsonb)
  from public, anon;
grant execute on function public.apply_emotion_mutations(bigint, jsonb)
  to authenticated;

commit;
