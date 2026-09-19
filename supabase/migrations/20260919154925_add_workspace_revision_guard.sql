alter table public.workspace_state_snapshots
  add column if not exists revision bigint not null default 1 check (revision >= 1);

create or replace function public.save_workspace_state_if_current(
  p_owner_user_id uuid,
  p_expected_revision bigint,
  p_schema_version integer,
  p_state jsonb
)
returns table(revision bigint, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_expected_revision is null then
    return query
      insert into public.workspace_state_snapshots(owner_user_id, schema_version, state, revision, updated_at)
      values (p_owner_user_id, p_schema_version, p_state, 1, now())
      on conflict (owner_user_id) do nothing
      returning workspace_state_snapshots.revision, workspace_state_snapshots.updated_at;
  else
    return query
      update public.workspace_state_snapshots
      set schema_version = p_schema_version,
          state = p_state,
          revision = workspace_state_snapshots.revision + 1,
          updated_at = now()
      where owner_user_id = p_owner_user_id
        and workspace_state_snapshots.revision = p_expected_revision
      returning workspace_state_snapshots.revision, workspace_state_snapshots.updated_at;
  end if;
end;
$$;

revoke execute on function public.save_workspace_state_if_current(uuid, bigint, integer, jsonb) from public, anon;
grant execute on function public.save_workspace_state_if_current(uuid, bigint, integer, jsonb) to authenticated, service_role;

comment on function public.save_workspace_state_if_current(uuid, bigint, integer, jsonb)
  is 'Optimistic concurrency guard for the temporary workspace JSON bridge.';
