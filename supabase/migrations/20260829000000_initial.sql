-- Tenderat AI Albania: private, owner-scoped tender intelligence schema.
-- Apply this migration to a dedicated Supabase project for the Albanian company.

create extension if not exists pgcrypto;

create table if not exists public.company_capability_profiles (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null,
  trades text[] not null default '{}',
  cpv_prefixes text[] not null default '{}',
  service_regions text[] not null default '{}',
  min_value_all numeric,
  max_value_all numeric,
  licences text[] not null default '{}',
  preferred_authorities text[] not null default '{}',
  excluded_terms text[] not null default '{}',
  available_employees integer,
  available_equipment text[] not null default '{}',
  max_concurrent_projects integer,
  current_projects integer not null default 0,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.bulletins (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  bulletin_number text not null,
  bulletin_type text not null check (bulletin_type in ('regular', 'special', 'unknown')),
  publication_date date not null,
  file_name text not null,
  file_hash text not null,
  storage_path text not null,
  page_count integer not null default 0 check (page_count >= 0),
  notice_count integer not null default 0 check (notice_count >= 0),
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'needs_review', 'failed')),
  processing_stage text not null default 'queued',
  last_error text,
  source_url text,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (owner_user_id, file_hash)
);

create table if not exists public.bulletin_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  bulletin_id uuid not null references public.bulletins(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'retryable', 'succeeded', 'failed')),
  stage text not null default 'queued',
  attempt_count integer not null default 0,
  source_fingerprint text not null,
  last_error text,
  result_metadata jsonb not null default '{}',
  locked_at timestamptz,
  locked_by text,
  next_run_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_user_id, bulletin_id, source_fingerprint)
);

create table if not exists public.tender_notices (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  bulletin_id uuid not null references public.bulletins(id) on delete cascade,
  reference_number text not null,
  parent_reference_number text,
  lot_number text,
  contracting_authority text not null,
  address text,
  contact_email text,
  procedure_type text not null,
  contract_object text not null,
  cpv_codes text[] not null default '{}',
  limit_fund_all numeric,
  vat_status text,
  financing_text text,
  duration_text text,
  submission_deadline timestamptz,
  republished boolean not null default false,
  source_page_start integer not null,
  source_page_end integer not null,
  source_text text not null,
  extraction_confidence numeric not null default 0 check (extraction_confidence between 0 and 1),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'expired', 'cancelled', 'correction')),
  source_key text not null default 'app_bulletin',
  created_at timestamptz not null default now(),
  unique (owner_user_id, reference_number, bulletin_id)
);

create table if not exists public.tender_matches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  tender_notice_id uuid not null references public.tender_notices(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  decision text not null check (decision in ('high_fit', 'good_fit', 'review', 'low_fit', 'blocked')),
  components jsonb not null default '{}',
  blockers jsonb not null default '[]',
  reasons jsonb not null default '[]',
  matched_terms jsonb not null default '[]',
  missing_information jsonb not null default '[]',
  capability_version integer not null default 1,
  ranking_version text not null default 'albania-rules-v1',
  updated_at timestamptz not null default now(),
  unique (owner_user_id, tender_notice_id)
);

create table if not exists public.tender_insights (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  tender_notice_id uuid not null references public.tender_notices(id) on delete cascade,
  insight_type text not null check (insight_type in ('summary', 'work', 'risk', 'next_action', 'requirement')),
  text_al text not null,
  evidence jsonb not null default '[]',
  fact_or_inference text not null check (fact_or_inference in ('extracted_fact', 'inference')),
  confidence numeric not null default 0 check (confidence between 0 and 1),
  model_version text,
  created_at timestamptz not null default now()
);

create index if not exists bulletins_owner_date_idx on public.bulletins(owner_user_id, publication_date desc);
create index if not exists jobs_queue_idx on public.bulletin_processing_jobs(status, next_run_at, created_at);
create index if not exists notices_owner_deadline_idx on public.tender_notices(owner_user_id, submission_deadline);
create index if not exists notices_owner_object_search_idx on public.tender_notices using gin (to_tsvector('simple', contract_object || ' ' || contracting_authority || ' ' || reference_number));
create index if not exists matches_owner_score_idx on public.tender_matches(owner_user_id, score desc);

alter table public.company_capability_profiles enable row level security;
alter table public.company_capability_profiles force row level security;
alter table public.bulletins enable row level security;
alter table public.bulletins force row level security;
alter table public.bulletin_processing_jobs enable row level security;
alter table public.bulletin_processing_jobs force row level security;
alter table public.tender_notices enable row level security;
alter table public.tender_notices force row level security;
alter table public.tender_matches enable row level security;
alter table public.tender_matches force row level security;
alter table public.tender_insights enable row level security;
alter table public.tender_insights force row level security;

create policy company_profile_owner_select on public.company_capability_profiles for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy company_profile_owner_insert on public.company_capability_profiles for insert to authenticated with check ((select auth.uid()) = owner_user_id);
create policy company_profile_owner_update on public.company_capability_profiles for update to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy bulletin_owner_all on public.bulletins for all to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy job_owner_all on public.bulletin_processing_jobs for all to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy notice_owner_all on public.tender_notices for all to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy match_owner_all on public.tender_matches for all to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy insight_owner_all on public.tender_insights for all to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);

revoke all on public.company_capability_profiles, public.bulletins, public.bulletin_processing_jobs, public.tender_notices, public.tender_matches, public.tender_insights from anon;
grant select, insert, update, delete on public.company_capability_profiles, public.bulletins, public.bulletin_processing_jobs, public.tender_notices, public.tender_matches, public.tender_insights to authenticated;
grant all on public.company_capability_profiles, public.bulletins, public.bulletin_processing_jobs, public.tender_notices, public.tender_matches, public.tender_insights to service_role;

insert into storage.buckets (id, name, public) values ('app-bulletins', 'app-bulletins', false) on conflict (id) do nothing;
create policy bulletin_storage_read on storage.objects for select to authenticated using (bucket_id = 'app-bulletins' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy bulletin_storage_insert on storage.objects for insert to authenticated with check (bucket_id = 'app-bulletins' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy bulletin_storage_update on storage.objects for update to authenticated using (bucket_id = 'app-bulletins' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'app-bulletins' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy bulletin_storage_delete on storage.objects for delete to authenticated using (bucket_id = 'app-bulletins' and (storage.foldername(name))[1] = (select auth.uid())::text);
