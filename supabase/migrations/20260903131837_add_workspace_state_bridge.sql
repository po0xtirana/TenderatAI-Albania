-- Compatibility persistence for the current app while all screens move to
-- normalized reads. The JSON snapshot is private and owner-scoped; it is not
-- exposed to anonymous clients and is safe to remove after the repository
-- migration is complete.
create table if not exists public.workspace_state_snapshots (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version >= 1),
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspace_state_snapshots enable row level security;
alter table public.workspace_state_snapshots force row level security;
revoke all on table public.workspace_state_snapshots from anon, authenticated;
grant select, insert, update on table public.workspace_state_snapshots to authenticated;
grant all on table public.workspace_state_snapshots to service_role;

drop policy if exists workspace_state_owner_select on public.workspace_state_snapshots;
drop policy if exists workspace_state_owner_insert on public.workspace_state_snapshots;
drop policy if exists workspace_state_owner_update on public.workspace_state_snapshots;
create policy workspace_state_owner_select on public.workspace_state_snapshots
  for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy workspace_state_owner_insert on public.workspace_state_snapshots
  for insert to authenticated with check ((select auth.uid()) = owner_user_id);
create policy workspace_state_owner_update on public.workspace_state_snapshots
  for update to authenticated using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create index if not exists workspace_state_updated_idx
  on public.workspace_state_snapshots(updated_at desc);

-- Fields that were previously held only in the local JSON record.
alter table public.tender_matches add column if not exists workflow_status text not null default 'new';
alter table public.tender_matches add column if not exists relevance_feedback boolean;
alter table public.tender_matches add column if not exists feedback_at timestamptz;
alter table public.tender_matches drop constraint if exists tender_matches_workflow_status_check;
alter table public.tender_matches add constraint tender_matches_workflow_status_check
  check (workflow_status in ('new', 'watching', 'reviewing', 'bid', 'no_bid'));

alter table public.bulletins add column if not exists processing_attempt_count integer not null default 0;
alter table public.bulletins add column if not exists processing_updated_at timestamptz not null default now();
alter table public.bulletins add column if not exists source_fingerprint text;

create index if not exists matches_owner_workflow_idx
  on public.tender_matches(owner_user_id, workflow_status, updated_at desc);
create index if not exists notices_owner_reference_idx
  on public.tender_notices(owner_user_id, reference_number);

-- New public-schema tables are not automatically exposed on newer Supabase
-- projects. Keep grants explicit while RLS remains the row-level boundary.
grant select, insert, update, delete on public.workspace_state_snapshots to authenticated;
