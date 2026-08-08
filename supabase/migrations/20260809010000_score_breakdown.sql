-- Keep the reasoning behind the score, not just the number.
--
-- The score is no longer a holistic guess: the model classifies five anchored
-- dimensions ("is the sector depth none, thin, adequate or strong?") and the
-- arithmetic happens in code. Storing the classifications means a card can show
-- *why* a solicitation scored what it did — "strong sector depth (30), no local
-- presence (0)" — which is something Khaled can argue with, in a way that "84%"
-- never was.
alter table rfps add column if not exists score_breakdown jsonb;

comment on column rfps.score_breakdown is
  'Per-dimension rubric classifications the score was computed from. See lib/rubric.ts.';

-- Per-dimension maximums. Null means the defaults in lib/rubric.ts, so this only
-- has to hold a value once Khaled decides that, say, local presence matters more
-- to him than we assumed.
alter table scoring_settings add column if not exists rubric_weights jsonb;

comment on column scoring_settings.rubric_weights is
  'Optional per-dimension point maximums, keyed by rubric dimension. Null uses the defaults.';
