-- A fourth answer to "does Caravann meet this requirement?": we cannot tell.
--
-- The gate previously offered pass / fail / not_applicable, and the prompt
-- (correctly) says never to assume a capability the profile does not record.
-- Between those two rules a requirement the profile is simply *silent* on has
-- only one available answer — "fail" — and a required fail closes the bid.
--
-- So the desk was reading gaps in our own profile data as deficiencies in
-- Caravann. Measured: a transit solicitation asking for "experience
-- facilitating elected or appointed governing bodies" was marked no_go on
-- three runs out of three, on a firm that has run board workshops for public
-- agencies for twelve years. The profile just never said so in those words.
--
-- The two cases need different answers because they have wildly different
-- costs. A real miss should close the bid. A silence should raise a question:
-- a false no_go loses a $45K-$185K pursuit into the folder nobody reopens,
-- while a false maybe costs five minutes of reading.
alter table public.rfp_disqualifier_checks
  drop constraint if exists rfp_disqualifier_checks_result_check;

alter table public.rfp_disqualifier_checks
  add constraint rfp_disqualifier_checks_result_check
  check (result in ('pass', 'fail', 'not_applicable', 'unclear'));

comment on column public.rfp_disqualifier_checks.result is
  'pass: the profile shows Caravann meets it. fail: the profile shows it does not — a required fail closes the bid. not_applicable: the requirement does not apply. unclear: the profile does not say either way — caps the verdict at maybe and surfaces the question rather than guessing.';
