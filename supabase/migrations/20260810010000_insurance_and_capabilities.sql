-- Give the two questions triage keeps asking somewhere to live.
--
-- Measured across live runs, the same two mandatory requirements came back
-- "unclear" every single time:
--
--   · General liability insurance of $2,000,000
--   · Experience facilitating elected or appointed governing bodies
--
-- Both are things Caravann almost certainly satisfies. The profile simply had
-- no field for either, so the model could not confirm them and - correctly,
-- under the unclear rule - refused to guess. Every solicitation that mentions
-- insurance therefore lands at "maybe" and asks a human the same question
-- forever.
--
-- Free text rather than structured limits on purpose: solicitations phrase
-- requirements in ways a numeric field cannot hold ("$2M per occurrence /
-- $4M aggregate, plus professional liability and auto"), and a field that
-- cannot express the real answer gets left blank.
alter table public.org_profile
  add column if not exists insurance_coverage text,
  add column if not exists governing_body_experience text;

comment on column public.org_profile.insurance_coverage is
  'Coverage carried, in Caravann''s own words - types and limits. Read by the disqualifier gate so insurance requirements resolve to pass or fail rather than unclear.';

comment on column public.org_profile.governing_body_experience is
  'Experience facilitating elected or appointed bodies - councils, boards, commissions. A recurring mandatory requirement in transit and public-agency solicitations that the profile previously could not answer.';
