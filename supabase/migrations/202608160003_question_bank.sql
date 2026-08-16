-- Questions the desk has asked before, and Khaled approved.
--
-- Module 7 promised a bank that improves with use. What existed drafted good
-- questions fresh every time and forgot them the moment the bid closed, so the
-- twentieth solicitation was asked with exactly as much accumulated judgement
-- as the first.
--
-- Only approved questions land here. A drafted question is the desk's opinion;
-- an approved one is Khaled saying it was worth asking, which is the only
-- signal in the system worth learning from. Sent is not the bar either: he
-- approves questions he then decides not to send for reasons that have nothing
-- to do with whether the question was good.
--
-- Deduplicated on the normalised text rather than a plain unique constraint on
-- question_text, because the same question arrives with different punctuation,
-- casing and trailing whitespace every time, and three near-identical rows is
-- a bank that teaches the model to repeat itself.
create table if not exists question_bank (
  id uuid primary key default gen_random_uuid(),
  lane text not null,
  question_text text not null,
  -- Lowercased, punctuation and runs of whitespace collapsed. Generated rather
  -- than written by the caller so two code paths cannot disagree about it.
  normalised text generated always as (
    regexp_replace(lower(trim(question_text)), '[^a-z0-9]+', ' ', 'g')
  ) stored,
  times_approved integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_approved_at timestamptz not null default now()
);

create unique index if not exists question_bank_unique on question_bank (lane, normalised);
create index if not exists question_bank_rank on question_bank (lane, times_approved desc);

comment on table question_bank is
  'Questions Khaled has approved, deduplicated by normalised text. Served into the triage prompt so a solicitation is asked with everything learned from the ones before it.';

alter table question_bank enable row level security;

-- Same posture as every other table here: the dashboard reads and writes as the
-- signed-in user, anonymous callers get nothing.
drop policy if exists question_bank_authenticated on question_bank;
create policy question_bank_authenticated on question_bank
  for all to authenticated using (true) with check (true);
