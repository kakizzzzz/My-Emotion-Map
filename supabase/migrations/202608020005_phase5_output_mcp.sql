-- Split the default read-only Emotion Map Output MCP from optional proposal actions.
alter table public.mcp_tokens
add column if not exists kind text;

update public.mcp_tokens
set kind = case
  when scopes @> array['proposals:write']::text[] then 'action'
  else 'output'
end
where kind is null;

alter table public.mcp_tokens
alter column kind set default 'output';
alter table public.mcp_tokens
alter column kind set not null;
alter table public.mcp_tokens
drop constraint if exists mcp_tokens_kind_check;
alter table public.mcp_tokens
add constraint mcp_tokens_kind_check check (kind in ('output', 'action'));

grant select (kind) on public.mcp_tokens to authenticated;

create or replace function public.issue_mcp_token(
  p_kind text,
  p_ttl_hours integer default 24
)
returns table(token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text;
  v_scopes text[];
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_ttl_hours not in (1, 24, 720) then
    raise exception 'invalid token lifetime' using errcode = '22023';
  end if;
  v_scopes := case p_kind
    when 'output' then array['records:read']::text[]
    when 'action' then array['proposals:write']::text[]
    else null
  end;
  if v_scopes is null then
    raise exception 'invalid token kind' using errcode = '22023';
  end if;
  v_token := 'mem_' || encode(gen_random_bytes(32), 'hex');
  insert into public.mcp_tokens (user_id, token_hash, kind, scopes, expires_at)
  values (
    v_user_id,
    encode(digest(v_token, 'sha256'), 'hex'),
    p_kind,
    v_scopes,
    now() + make_interval(hours => p_ttl_hours)
  );
  return query select v_token, now() + make_interval(hours => p_ttl_hours);
end;
$$;

create or replace function public.revoke_mcp_tokens(p_kind text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_kind not in ('output', 'action') then
    raise exception 'invalid token kind' using errcode = '22023';
  end if;
  update public.mcp_tokens
  set revoked_at = coalesce(revoked_at, now())
  where user_id = auth.uid() and kind = p_kind and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.revoke_all_mcp_tokens() from authenticated;
revoke all on function public.revoke_mcp_tokens(text) from public, anon;
grant execute on function public.revoke_mcp_tokens(text) to authenticated;
