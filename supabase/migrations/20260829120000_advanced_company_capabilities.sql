-- Advanced, versioned company qualification and delivery-capacity model.
-- The existing company_capability_profiles table remains the compatibility projection.

alter table public.company_capability_profiles
  add column if not exists legal_name text,
  add column if not exists trading_name text,
  add column if not exists nipt text,
  add column if not exists entity_type text,
  add column if not exists registered_address text,
  add column if not exists phone text,
  add column if not exists contact_email text,
  add column if not exists website text,
  add column if not exists year_founded integer,
  add column if not exists procurement_registered boolean not null default false,
  add column if not exists company_description text,
  add column if not exists profile_status text not null default 'draft',
  add column if not exists readiness_score integer not null default 0,
  add column if not exists active_version integer not null default 0,
  add column if not exists draft_updated_at timestamptz not null default now();

create table if not exists public.company_operating_locations (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  name text not null, address text not null default '', city text not null default '', region text not null default '',
  is_primary boolean not null default false, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.company_work_capabilities (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  trade text not null, cpv_prefixes text[] not null default '{}', project_types text[] not null default '{}', building_types text[] not null default '{}',
  delivery_method text not null default 'self_performed' check (delivery_method in ('self_performed','subcontracted','both')),
  min_project_value_all numeric check (min_project_value_all is null or min_project_value_all >= 0),
  preferred_project_value_all numeric check (preferred_project_value_all is null or preferred_project_value_all >= 0),
  max_project_value_all numeric check (max_project_value_all is null or max_project_value_all >= 0),
  excluded_work text[] not null default '{}', active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.company_service_areas (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  region text not null, municipalities text[] not null default '{}', travel_radius_km numeric check (travel_radius_km is null or travel_radius_km >= 0),
  mobilization_days integer check (mobilization_days is null or mobilization_days >= 0), remote_limitations text not null default '',
  temporary_site_capable boolean not null default false, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.company_compliance_records (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  record_type text not null check (record_type in ('licence','certification','insurance','compliance')), name text not null,
  category text not null default '', subcategory text not null default '', level text not null default '', issuer text not null default '',
  reference_number text not null default '', issue_date date, expiry_date date,
  status text not null default 'valid' check (status in ('valid','pending','expired')), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.company_key_people (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  full_name text not null, role text not null, discipline text not null default '', skills text[] not null default '{}',
  years_experience integer check (years_experience is null or years_experience >= 0), education text not null default '',
  licences text[] not null default '{}', certifications text[] not null default '{}', available_from date,
  availability_percent integer not null default 100 check (availability_percent between 0 and 100), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.company_labour_pools (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  role text not null, skills text[] not null default '{}', skill_level text not null default 'qualified' check (skill_level in ('entry','qualified','specialist')),
  headcount integer not null default 0 check (headcount >= 0), available_headcount integer not null default 0 check (available_headcount >= 0),
  available_from date, active boolean not null default true, availability_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (available_headcount <= headcount)
);

create table if not exists public.company_crew_capabilities (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  name text not null, work_category text not null default '', roles jsonb not null default '[]',
  available_crew_count integer not null default 0 check (available_crew_count >= 0), current_assignment text not null default '',
  available_from date, max_shift_hours numeric check (max_shift_hours is null or max_shift_hours between 1 and 24),
  max_concurrent_projects integer not null default 1 check (max_concurrent_projects >= 1), production_capacity text not null default '',
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.company_equipment_resources (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  resource_type text not null check (resource_type in ('equipment','vehicle')), name text not null, category text not null default '',
  ownership text not null check (ownership in ('owned','leased','rentable')), model text not null default '',
  quantity integer not null default 0 check (quantity >= 0), available_quantity integer not null default 0 check (available_quantity >= 0),
  capacity text not null default '', location text not null default '', available_from date,
  condition text not null default 'good' check (condition in ('excellent','good','service_due','unavailable')),
  inspection_expiry date, limitations text not null default '', rental_fallback boolean not null default false,
  active boolean not null default true, availability_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (available_quantity <= quantity)
);

create table if not exists public.company_financial_capacities (
  owner_user_id uuid primary key references public.company_capability_profiles(owner_user_id) on delete cascade,
  turnover_history jsonb not null default '[]', working_capital_all numeric check (working_capital_all is null or working_capital_all >= 0),
  credit_facilities_all numeric check (credit_facilities_all is null or credit_facilities_all >= 0),
  available_project_financing_all numeric check (available_project_financing_all is null or available_project_financing_all >= 0),
  max_contract_value_all numeric check (max_contract_value_all is null or max_contract_value_all >= 0),
  current_backlog_all numeric check (current_backlog_all is null or current_backlog_all >= 0),
  max_concurrent_commitment_all numeric check (max_concurrent_commitment_all is null or max_concurrent_commitment_all >= 0),
  bid_security_limit_all numeric check (bid_security_limit_all is null or bid_security_limit_all >= 0),
  performance_guarantee_limit_all numeric check (performance_guarantee_limit_all is null or performance_guarantee_limit_all >= 0),
  insurance_limit_all numeric check (insurance_limit_all is null or insurance_limit_all >= 0),
  bonding_limit_all numeric check (bonding_limit_all is null or bonding_limit_all >= 0),
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.company_reference_projects (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  title text not null, client text not null default '', authority text not null default '', cpv_codes text[] not null default '{}',
  work_types text[] not null default '{}', value_all numeric check (value_all is null or value_all >= 0), region text not null default '',
  start_date date, end_date date, project_role text not null check (project_role in ('main_contractor','joint_venture','subcontractor')),
  status text not null check (status in ('completed','in_progress')), outcome text not null default '', reference_contact text not null default '',
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.company_capability_partners (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  name text not null, partner_type text not null check (partner_type in ('subcontractor','strategic_partner','joint_venture')),
  categories text[] not null default '{}', licences text[] not null default '{}', regions text[] not null default '{}',
  availability text not null default '', dependency_risk text not null default 'medium' check (dependency_risk in ('low','medium','high')),
  joint_venture_ready boolean not null default false, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.company_active_commitments (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  project_name text not null, work_type text not null default '', start_date date, end_date date,
  committed_people integer not null default 0 check (committed_people >= 0), committed_crews integer not null default 0 check (committed_crews >= 0),
  committed_equipment text[] not null default '{}', active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.company_bid_preferences (
  owner_user_id uuid primary key references public.company_capability_profiles(owner_user_id) on delete cascade,
  preferred_authorities text[] not null default '{}', excluded_authorities text[] not null default '{}',
  preferred_project_types text[] not null default '{}', excluded_project_types text[] not null default '{}',
  minimum_lead_days integer check (minimum_lead_days is null or minimum_lead_days >= 0),
  max_contract_months integer check (max_contract_months is null or max_contract_months >= 1),
  max_concurrent_projects integer check (max_concurrent_projects is null or max_concurrent_projects >= 1),
  accepted_payment_days integer check (accepted_payment_days is null or accepted_payment_days >= 0),
  requires_advance_payment boolean not null default false,
  max_liquidated_damages_percent numeric check (max_liquidated_damages_percent is null or max_liquidated_damages_percent between 0 and 100),
  joint_venture_allowed boolean not null default false, rules jsonb not null default '[]', active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.company_capability_documents (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  section_key text not null check (section_key in ('identity','work','geography','compliance','people','crews','equipment','financial','experience','partners','rules')),
  category text not null, file_name text not null, mime_type text not null, file_size bigint not null check (file_size between 1 and 15728640),
  storage_path text not null, expires_at date, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.company_capability_versions (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  version integer not null check (version >= 1), readiness_score integer not null check (readiness_score between 0 and 100),
  snapshot jsonb not null, activated_at timestamptz not null default now(), created_at timestamptz not null default now(),
  unique (owner_user_id, version)
);

create index if not exists operating_locations_owner_active_idx on public.company_operating_locations(owner_user_id) where active;
create index if not exists work_capabilities_owner_active_idx on public.company_work_capabilities(owner_user_id) where active;
create index if not exists work_capabilities_cpv_idx on public.company_work_capabilities using gin(cpv_prefixes);
create index if not exists service_areas_owner_active_idx on public.company_service_areas(owner_user_id) where active;
create index if not exists compliance_owner_expiry_idx on public.company_compliance_records(owner_user_id, expiry_date) where active;
create index if not exists key_people_owner_active_idx on public.company_key_people(owner_user_id) where active;
create index if not exists labour_pools_owner_active_idx on public.company_labour_pools(owner_user_id) where active;
create index if not exists crews_owner_active_idx on public.company_crew_capabilities(owner_user_id) where active;
create index if not exists equipment_owner_active_idx on public.company_equipment_resources(owner_user_id) where active;
create index if not exists reference_projects_owner_active_idx on public.company_reference_projects(owner_user_id) where active;
create index if not exists reference_projects_cpv_idx on public.company_reference_projects using gin(cpv_codes);
create index if not exists partners_owner_active_idx on public.company_capability_partners(owner_user_id) where active;
create index if not exists commitments_owner_end_idx on public.company_active_commitments(owner_user_id, end_date) where active;
create index if not exists capability_documents_owner_section_idx on public.company_capability_documents(owner_user_id, section_key) where active;
create index if not exists capability_versions_owner_version_idx on public.company_capability_versions(owner_user_id, version desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'company_operating_locations','company_work_capabilities','company_service_areas','company_compliance_records',
    'company_key_people','company_labour_pools','company_crew_capabilities','company_equipment_resources',
    'company_financial_capacities','company_reference_projects','company_capability_partners','company_active_commitments',
    'company_bid_preferences','company_capability_documents','company_capability_versions'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    if table_name = 'company_capability_versions' then
      execute format('grant select, insert on table public.%I to authenticated', table_name);
    else
      execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    end if;
    execute format('grant all on table public.%I to service_role', table_name);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = table_name || '_owner_select') then
      execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = owner_user_id)', table_name || '_owner_select', table_name);
      execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = owner_user_id)', table_name || '_owner_insert', table_name);
      if table_name <> 'company_capability_versions' then
        execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id)', table_name || '_owner_update', table_name);
        execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = owner_user_id)', table_name || '_owner_delete', table_name);
      end if;
    end if;
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capability-documents', 'capability-documents', false, 15728640, array['application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy capability_storage_read on storage.objects for select to authenticated
using (bucket_id = 'capability-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy capability_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'capability-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy capability_storage_update on storage.objects for update to authenticated
using (bucket_id = 'capability-documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'capability-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy capability_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'capability-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
