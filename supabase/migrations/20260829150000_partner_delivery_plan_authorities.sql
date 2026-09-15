-- Partner capability depth, tender delivery plans and normalized authority filters.
-- The local JSON store remains compatible; these tables are the production projection.

do $$
begin
  alter table public.company_capability_partners drop constraint if exists company_capability_partners_partner_type_check;
  if not exists (select 1 from pg_constraint where conname = 'company_capability_partners_partner_type_check' and conrelid = 'public.company_capability_partners'::regclass) then
    alter table public.company_capability_partners add constraint company_capability_partners_partner_type_check check (partner_type in ('subcontractor','strategic_partner','joint_venture','equipment_rental'));
  end if;
end $$;

alter table public.company_capability_partners add column if not exists nipt text;
alter table public.company_capability_partners add column if not exists contact_name text;
alter table public.company_capability_partners add column if not exists phone text;
alter table public.company_capability_partners add column if not exists email text;
alter table public.company_capability_partners add column if not exists approval_status text not null default 'pending';
alter table public.company_capability_partners add column if not exists work_types text[] not null default '{}';
alter table public.company_capability_partners add column if not exists cpv_codes text[] not null default '{}';
alter table public.company_capability_partners add column if not exists excluded_work text[] not null default '{}';
alter table public.company_capability_partners add column if not exists lead_time_days integer;
alter table public.company_capability_partners add column if not exists max_contract_value_all numeric;
alter table public.company_capability_partners add column if not exists max_concurrent_projects integer;
alter table public.company_capability_partners add column if not exists notes text not null default '';
alter table public.company_capability_partners add column if not exists performance jsonb not null default '{"completedProjects":0,"onTimeRate":null,"qualityRating":null,"lastUsedAt":null,"notes":""}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_capability_partners_approval_status_check' and conrelid = 'public.company_capability_partners'::regclass) then
    alter table public.company_capability_partners add constraint company_capability_partners_approval_status_check check (approval_status in ('approved','pending','blocked'));
  end if;
end $$;

create table if not exists public.company_partner_capabilities (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  partner_id uuid not null references public.company_capability_partners(id) on delete cascade,
  name text not null, category text not null default '', cpv_codes text[] not null default '{}', tasks text[] not null default '{}',
  delivery_mode text not null default 'execution' check (delivery_mode in ('execution','specialist','licence_support')),
  headcount integer not null default 0 check (headcount >= 0), crew_count integer not null default 0 check (crew_count >= 0),
  available_from date, capacity_notes text not null default '', active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.company_partner_resources (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  partner_id uuid not null references public.company_capability_partners(id) on delete cascade,
  resource_type text not null check (resource_type in ('equipment','vehicle','crew')), name text not null, model text not null default '', category text not null default '',
  quantity integer not null default 0 check (quantity >= 0), available_quantity integer not null default 0 check (available_quantity >= 0 and available_quantity <= quantity),
  capacity text not null default '', location text not null default '', available_from date, operator_included boolean not null default false,
  fuel_included boolean not null default false, transport_included boolean not null default false, rental_minimum_days integer,
  condition text not null default 'good' check (condition in ('excellent','good','service_due','unavailable')), inspection_expiry date, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.company_partner_rates (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  partner_id uuid not null references public.company_capability_partners(id) on delete cascade,
  capability_id uuid references public.company_partner_capabilities(id) on delete set null,
  resource_id uuid references public.company_partner_resources(id) on delete set null,
  scope text not null default '', unit text not null check (unit in ('hour','day','month','unit','lump_sum')),
  amount numeric not null check (amount >= 0), currency text not null default 'ALL', vat_included boolean not null default false,
  minimum_commitment numeric, valid_from date, valid_until date, notes text not null default '', active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.contracting_authorities (
  id uuid primary key default gen_random_uuid(), canonical_name text not null unique, abbreviation text, parent_authority_id uuid references public.contracting_authorities(id) on delete set null,
  active boolean not null default true, created_at timestamptz not null default now()
);

create table if not exists public.contracting_authority_aliases (
  id uuid primary key default gen_random_uuid(), authority_id uuid not null references public.contracting_authorities(id) on delete cascade,
  alias text not null, normalized_alias text not null, unique (authority_id, normalized_alias)
);

alter table public.tender_notices add column if not exists authority_id uuid references public.contracting_authorities(id) on delete set null;

create table if not exists public.tender_work_packages (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  tender_notice_id uuid not null references public.tender_notices(id) on delete cascade, phase text not null, task text not null,
  quantity numeric, unit text, requirements jsonb not null default '[]', source text not null check (source in ('bulletin','document','inference','manual')),
  source_page integer not null default 1, evidence_text text not null default '', confidence numeric not null default 0 check (confidence between 0 and 1),
  verification_status text not null default 'provisional' check (verification_status in ('provisional','extracted','confirmed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.tender_work_allocations (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  work_package_id uuid not null references public.tender_work_packages(id) on delete cascade, allocation_source text not null check (allocation_source in ('internal','partner','rental','hybrid','uncovered')),
  share_percent numeric not null default 0 check (share_percent >= 0 and share_percent <= 100), partner_id uuid references public.company_capability_partners(id) on delete set null,
  resource_id uuid references public.company_partner_resources(id) on delete set null, company_capability text, estimated_amount_all numeric,
  status text not null default 'suggested' check (status in ('suggested','confirmed','overridden')), rationale text not null default '', dependency_risk text not null default 'low' check (dependency_risk in ('low','medium','high')),
  confidence numeric not null default 0 check (confidence between 0 and 1), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.tender_filter_presets (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.company_capability_profiles(owner_user_id) on delete cascade,
  name text not null, authority_ids uuid[] not null default '{}', decision text, query text not null default '', is_default boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (owner_user_id, name)
);

create index if not exists partner_capabilities_partner_idx on public.company_partner_capabilities(partner_id);
create index if not exists partner_capabilities_owner_cpv_idx on public.company_partner_capabilities using gin(cpv_codes);
create index if not exists partner_resources_partner_idx on public.company_partner_resources(partner_id);
create index if not exists partner_resources_owner_available_idx on public.company_partner_resources(owner_user_id, available_from) where active;
create index if not exists partner_rates_partner_validity_idx on public.company_partner_rates(partner_id, valid_until) where active;
create index if not exists authority_aliases_normalized_idx on public.contracting_authority_aliases(normalized_alias);
create index if not exists notices_authority_deadline_idx on public.tender_notices(authority_id, submission_deadline);
create index if not exists work_packages_tender_idx on public.tender_work_packages(owner_user_id, tender_notice_id);
create index if not exists allocations_package_idx on public.tender_work_allocations(owner_user_id, work_package_id);
create index if not exists filter_presets_owner_idx on public.tender_filter_presets(owner_user_id, updated_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array['company_partner_capabilities','company_partner_resources','company_partner_rates','tender_work_packages','tender_work_allocations','tender_filter_presets'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = table_name || '_owner_all') then
      execute format('create policy %I on public.%I for all to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id)', table_name || '_owner_all', table_name);
    end if;
  end loop;
end $$;

alter table public.contracting_authorities enable row level security;
alter table public.contracting_authorities force row level security;
alter table public.contracting_authority_aliases enable row level security;
alter table public.contracting_authority_aliases force row level security;
revoke all on table public.contracting_authorities, public.contracting_authority_aliases from anon, authenticated;
grant select on public.contracting_authorities, public.contracting_authority_aliases to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contracting_authorities' and policyname = 'authority_authenticated_select') then
    create policy authority_authenticated_select on public.contracting_authorities for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contracting_authority_aliases' and policyname = 'authority_alias_authenticated_select') then
    create policy authority_alias_authenticated_select on public.contracting_authority_aliases for select to authenticated using (true);
  end if;
end $$;
