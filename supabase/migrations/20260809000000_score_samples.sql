-- Keep the individual reads, not just the median.
--
-- The workflow now scores each solicitation several times and takes the median,
-- because five reads of one identical document returned 55, 82, 86, 88 and 90 —
-- and the 55 would have dropped a winnable bid into the no-go folder.
--
-- Storing every sample matters for two reasons. It makes disagreement visible
-- rather than averaged away, so a shaky read looks shaky on the card. And it
-- gives us the only honest measure of whether the model is getting steadier:
-- spread over time, on real solicitations.

alter table rfps add column if not exists score_samples integer[];

comment on column rfps.score_samples is
  'Every score returned for this solicitation, one per triage run. score_percent is their median.';

-- How far the reads may disagree before the desk stops claiming confidence.
-- Beyond this the verdict is capped at "maybe": the honest answer to three
-- readers disagreeing is "look at this yourself", not a confident go or no-go.
-- A failed mandatory requirement is unaffected — that is a gate, not a judgement
-- about degree of fit, and it closes the bid however wide the spread.
alter table scoring_settings
  add column if not exists max_score_spread integer not null default 20
    check (max_score_spread between 0 and 100);
