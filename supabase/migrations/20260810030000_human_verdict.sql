-- Let Khaled disagree, and keep the disagreement.
--
-- Until now there was no way to. The review screen literally says "override a
-- verdict" and no such action existed — the desk could be wrong and there was
-- nowhere to say so. That is a problem twice over: the person using it has to
-- work around it rather than with it, and the one piece of data that would tell
-- us whether the verdicts are any good was being thrown away every time it was
-- generated.
--
-- This is also the honest answer to "should the system learn?". Not by
-- training — that would move the decision back inside a model, and the whole
-- design here is that the label is inspectable arithmetic a human controls.
-- What it should do is *record disagreement*, so the thresholds and weights can
-- be tuned against evidence instead of against my assumptions.
--
-- The prize: the twenty decided solicitations we keep asking Khaled to assemble
-- stop being homework. Every time he overrides a verdict in the course of
-- normal work, the answer key writes itself.
--
-- The machine verdict is never overwritten. Both are kept side by side, because
-- the gap between them is the measurement.
alter table public.rfps
  add column if not exists human_verdict text
    check (human_verdict is null or human_verdict in ('go', 'no_go', 'maybe')),
  add column if not exists human_verdict_at timestamptz,
  add column if not exists human_verdict_note text;

comment on column public.rfps.human_verdict is
  'What Khaled decided, when he disagreed with (or confirmed) the computed verdict. Never overwrites `status` — the two are kept side by side so the gap between them can be measured.';

comment on column public.rfps.human_verdict_note is
  'Why. The most valuable field in the table: "the score is fine, we just do not have the healthcare references" is a settings change, not a code change.';

-- Fast lookup for the calibration report: every row where a human and the desk
-- disagreed.
create index if not exists rfps_human_verdict_idx
  on public.rfps (human_verdict)
  where human_verdict is not null;
