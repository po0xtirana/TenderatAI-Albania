-- Cover the foreign-key joins introduced by the partner and delivery-plan model.
create index if not exists partner_capabilities_owner_idx on public.company_partner_capabilities(owner_user_id);
create index if not exists partner_resources_owner_idx on public.company_partner_resources(owner_user_id);
create index if not exists partner_rates_owner_idx on public.company_partner_rates(owner_user_id);
create index if not exists partner_rates_capability_idx on public.company_partner_rates(capability_id);
create index if not exists partner_rates_resource_idx on public.company_partner_rates(resource_id);
create index if not exists authorities_parent_idx on public.contracting_authorities(parent_authority_id);
create index if not exists work_packages_tender_notice_idx on public.tender_work_packages(tender_notice_id);
create index if not exists allocations_work_package_idx on public.tender_work_allocations(work_package_id);
create index if not exists allocations_partner_idx on public.tender_work_allocations(partner_id);
create index if not exists allocations_resource_idx on public.tender_work_allocations(resource_id);
