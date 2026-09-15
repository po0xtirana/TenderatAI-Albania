-- Cover existing foreign keys reported by the Supabase performance advisor.
create index if not exists bulletin_processing_jobs_bulletin_id_idx on public.bulletin_processing_jobs(bulletin_id);
create index if not exists tender_insights_owner_user_id_idx on public.tender_insights(owner_user_id);
create index if not exists tender_insights_tender_notice_id_idx on public.tender_insights(tender_notice_id);
create index if not exists tender_matches_tender_notice_id_idx on public.tender_matches(tender_notice_id);
create index if not exists tender_notices_bulletin_id_idx on public.tender_notices(bulletin_id);
