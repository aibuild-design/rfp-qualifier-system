-- Let a question be turned down, on the record.
--
-- The only actions were approve and mark-sent, so "no" was expressed by doing
-- nothing. Which meant a question Khaled had read and rejected looked exactly
-- like one he had not got to yet, and the memo carried both to the bottom of
-- the page as though still pending.
--
-- Silence is also unusable as a signal. The question bank learns from approval,
-- so it can tell which questions were good; it could never tell which were bad,
-- because rejection left no trace to learn from.
alter table rfp_questions drop constraint if exists rfp_questions_status_check;
alter table rfp_questions
  add constraint rfp_questions_status_check
  check (status in ('drafted', 'approved', 'declined', 'sent'));

alter table rfp_questions add column if not exists declined_at timestamptz;

comment on column rfp_questions.declined_at is
  'When this question was explicitly turned down. Distinct from a question nobody has looked at, which stays drafted.';
