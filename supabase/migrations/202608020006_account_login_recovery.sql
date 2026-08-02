-- Preserve ownership for accounts created before account-name authentication.
-- Only an unambiguous, valid account id from trusted auth metadata is adopted.
-- Existing mappings are never replaced.
with candidates as (
  select
    users.id as user_id,
    lower(trim(users.raw_user_meta_data ->> 'account_id')) as account_id
  from auth.users as users
), unique_candidates as (
  select user_id, account_id
  from candidates
  where account_id ~ '^[a-z0-9._-]{3,24}$'
    and account_id in (
      select account_id
      from candidates
      where account_id ~ '^[a-z0-9._-]{3,24}$'
      group by account_id
      having count(*) = 1
    )
)
insert into public.account_profiles(user_id, account_id)
select user_id, account_id
from unique_candidates
on conflict do nothing;
