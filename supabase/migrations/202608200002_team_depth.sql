-- Enough about a consultant to put them in a proposal.
--
-- The roster held a name, a one-word role, a rate and a list of
-- qualifications, which is enough to rank somebody against a solicitation and
-- nowhere near enough to write them into a submission. Caravann's own SamTrans
-- proposal carries a staffing table of name, role and primary responsibilities,
-- then biographies underneath, and none of that could be produced from what was
-- stored.
--
-- Kept as separate fields rather than one biography blob because they are read
-- differently: responsibilities go in a table, the biography goes in prose, and
-- credentials are what an evaluator scans for.
alter table team_members add column if not exists responsibilities text;
alter table team_members add column if not exists bio text;
alter table team_members add column if not exists credentials text;
alter table team_members add column if not exists years_experience integer;

comment on column team_members.responsibilities is
  'What this person does on an engagement, for the staffing table. Khaled''s own proposals list these per person.';
comment on column team_members.bio is
  'A short biography for the proposal. Prose, written once, reused.';
comment on column team_members.credentials is
  'Degrees, certifications and licences, which evaluators scan for directly.';
