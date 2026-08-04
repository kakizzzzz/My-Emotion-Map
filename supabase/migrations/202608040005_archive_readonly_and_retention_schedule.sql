-- Correct the archive grant inherited by service_role and activate the
-- retention schedule after pg_cron is available on the hosted project.

begin;

revoke all on table public.app_states from service_role;
grant select on table public.app_states to service_role;

create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
  v_enabled_count integer;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'emotion-trash-retention-daily'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'emotion-trash-retention-daily',
    '23 3 * * *',
    'select public.purge_expired_emotion_trash_all_users();'
  );

  select count(*) into v_enabled_count
  from cron.job
  where jobname = 'emotion-trash-retention-daily'
    and active;

  if v_enabled_count <> 1 then
    raise exception 'Expected exactly one enabled emotion trash retention job';
  end if;
end;
$$;

commit;
