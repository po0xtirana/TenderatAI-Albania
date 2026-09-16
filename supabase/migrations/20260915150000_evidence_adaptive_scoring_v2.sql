-- Evidence-adaptive scoring V2. The workspace JSON remains the compatibility
-- source while normalized tender matches receive the same auditable fields.
alter table public.tender_matches
  add column if not exists observed_fit_score integer,
  add column if not exists confidence_score integer,
  add column if not exists fit_range_low integer,
  add column if not exists fit_range_high integer,
  add column if not exists criterion_results jsonb not null default '[]'::jsonb,
  add column if not exists recommendation text,
  add column if not exists recommendation_reason text,
  add column if not exists critical_unknowns jsonb not null default '[]'::jsonb,
  add column if not exists calibration_version text not null default 'feedback-beta-v1';

update public.tender_matches
set observed_fit_score = coalesce(observed_fit_score, score),
    confidence_score = coalesce(confidence_score, 0),
    fit_range_low = coalesce(fit_range_low, score),
    fit_range_high = coalesce(fit_range_high, score),
    recommendation = coalesce(recommendation,
      case decision
        when 'high_fit' then 'strong'
        when 'good_fit' then 'good'
        when 'review' then 'review'
        when 'low_fit' then 'low'
        else 'blocked'
      end),
    recommendation_reason = coalesce(recommendation_reason, 'Rezultat historik para scoring V2.');

alter table public.tender_matches
  alter column observed_fit_score set not null,
  alter column confidence_score set not null,
  alter column fit_range_low set not null,
  alter column fit_range_high set not null,
  alter column recommendation set not null,
  alter column recommendation_reason set not null;

alter table public.tender_matches
  drop constraint if exists tender_matches_observed_fit_score_check,
  drop constraint if exists tender_matches_confidence_score_check,
  drop constraint if exists tender_matches_fit_range_check,
  drop constraint if exists tender_matches_recommendation_check;

alter table public.tender_matches
  add constraint tender_matches_observed_fit_score_check check (observed_fit_score between 0 and 100),
  add constraint tender_matches_confidence_score_check check (confidence_score between 0 and 100),
  add constraint tender_matches_fit_range_check check (fit_range_low between 0 and 100 and fit_range_high between 0 and 100 and fit_range_low <= fit_range_high),
  add constraint tender_matches_recommendation_check check (recommendation in ('strong', 'good', 'promising_verify', 'review', 'low', 'blocked'));

create index if not exists matches_owner_model_score_idx
  on public.tender_matches(owner_user_id, ranking_version, score desc);

-- Keep Data API permissions explicit. Existing owner-scoped RLS policies and
-- forced RLS continue to govern every row.
grant select, insert, update, delete on public.tender_matches to authenticated;
grant all on public.tender_matches to service_role;
