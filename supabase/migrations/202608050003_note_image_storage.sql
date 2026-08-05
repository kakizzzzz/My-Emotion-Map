-- Store one private image per emotion record. The normalized record keeps only
-- validated metadata; image bytes live in an owner-scoped private bucket.
-- Historical migrations remain unchanged.

begin;

create or replace function public.emotion_note_image_is_valid(
  p_value jsonb,
  p_user_id uuid
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p_value) = 'object'
    and p_user_id is not null
    and p_value ->> 'provider' = 'supabase'
    and p_value ->> 'bucket' = 'emotion-note-images'
    and p_value ->> 'mimeType' = 'image/jpeg'
    and coalesce(p_value ->> 'path', '') like p_user_id::text || '/notes/%'
    and coalesce(p_value ->> 'path', '')
      ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/notes/[A-Za-z0-9_-]{1,160}/[A-Za-z0-9_-]{1,160}\.jpg$'
    and public.emotion_json_integer_is_valid(p_value -> 'size', 1, 2097152)
    and public.emotion_json_integer_is_valid(p_value -> 'width', 1, 1600)
    and public.emotion_json_integer_is_valid(p_value -> 'height', 1, 1600)
    and public.emotion_json_integer_is_valid(
      p_value -> 'createdAt', 1, 9007199254740991
    );
$$;

revoke all on function public.emotion_note_image_is_valid(jsonb, uuid)
  from public, anon, authenticated;

alter table public.emotion_records
  add column if not exists note_image jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'emotion_records_note_image_valid'
      and conrelid = 'public.emotion_records'::regclass
  ) then
    alter table public.emotion_records
      add constraint emotion_records_note_image_valid check (
        note_image is null
        or public.emotion_note_image_is_valid(note_image, user_id)
      );
  end if;
end;
$$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'emotion-note-images',
  'emotion-note-images',
  false,
  2097152,
  array['image/jpeg']
) on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

drop policy if exists "Users can read own emotion note images" on storage.objects;
create policy "Users can read own emotion note images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'emotion-note-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can insert own emotion note images" on storage.objects;
create policy "Users can insert own emotion note images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'emotion-note-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own emotion note images" on storage.objects;
create policy "Users can update own emotion note images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'emotion-note-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'emotion-note-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own emotion note images" on storage.objects;
create policy "Users can delete own emotion note images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'emotion-note-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Keep the reviewed mutation engine intact. This compatibility wrapper applies
-- note-image metadata at the same dataset revision. Older clients that omit
-- the field preserve it; current clients explicitly send an image or null.
do $$
begin
  if to_regprocedure(
    'public.apply_emotion_mutations_v2_media_core(bigint,jsonb)'
  ) is null then
    alter function public.apply_emotion_mutations(bigint, jsonb)
      rename to apply_emotion_mutations_v2_media_core;
  end if;
end;
$$;

revoke all on function public.apply_emotion_mutations_v2_media_core(bigint, jsonb)
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
  v_saved boolean;
  v_revision bigint;
  v_conflict jsonb;
  v_mutation jsonb;
  v_payload jsonb;
  v_image jsonb;
begin
  if p_mutations is null or jsonb_typeof(p_mutations) <> 'array'
    or jsonb_array_length(p_mutations) not between 1 and 500 then
    raise exception 'Mutation batch size must be between 1 and 500'
      using errcode = '22023';
  end if;

  for v_mutation in
    select item.value
    from jsonb_array_elements(p_mutations) item(value)
    where item.value ->> 'type' = 'record_upsert'
  loop
    v_payload := coalesce(v_mutation -> 'payload', '{}'::jsonb);
    if v_payload ? 'image' then
      v_image := v_payload -> 'image';
      if v_image <> 'null'::jsonb and not coalesce(
        public.emotion_note_image_is_valid(v_image, auth.uid()),
        false
      ) then
        raise exception 'Invalid emotion note image metadata'
          using errcode = '22023';
      end if;
    end if;
  end loop;

  select result.saved, result.dataset_revision, result.conflict
  into v_saved, v_revision, v_conflict
  from public.apply_emotion_mutations_v2_media_core(
    p_expected_revision,
    p_mutations
  ) result;

  if v_saved then
    for v_mutation in
      select item.value
      from jsonb_array_elements(p_mutations) with ordinality item(value, position)
      where item.value ->> 'type' = 'record_upsert'
        and coalesce(item.value -> 'payload', '{}'::jsonb) ? 'image'
      order by item.position
    loop
      v_payload := v_mutation -> 'payload';
      v_image := v_payload -> 'image';
      update public.emotion_records set
        note_image = case when v_image = 'null'::jsonb then null else v_image end,
        changed_revision = v_revision,
        updated_at = now()
      where user_id = auth.uid()
        and moment_id = v_mutation ->> 'entityId';
    end loop;
  end if;

  return query select v_saved, v_revision, v_conflict;
end;
$$;

revoke all on function public.apply_emotion_mutations(bigint, jsonb)
  from public, anon;
grant execute on function public.apply_emotion_mutations(bigint, jsonb)
  to authenticated;

commit;
