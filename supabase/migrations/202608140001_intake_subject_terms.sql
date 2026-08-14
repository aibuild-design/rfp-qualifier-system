-- Which subject lines count as a solicitation.
--
-- This lived inside the n8n Gmail trigger's search query, where Khaled could not
-- see it or change it. Anything without one of five hardcoded words was never
-- fetched at all - not triaged and rejected, never seen - so an aggregator that
-- titles its mail "New opportunities this week" was silently invisible.
--
-- Stored as terms rather than a Gmail query string: a query string is a syntax
-- to get wrong, and quoting mistakes fail by matching nothing, which looks
-- exactly like a quiet week.
alter table scoring_settings
  add column if not exists email_subject_terms text[]
  not null
  default array['RFP','RFQ','solicitation','request for proposal','request for qualifications'];

comment on column scoring_settings.email_subject_terms is
  'Case-insensitive substrings; an email whose subject contains any one of them is triaged. Empty means triage everything that arrives.';
