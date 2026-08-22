-- Who decided the line between bid and do not bid.
--
-- The migration ships a go bar of 85. The database says 70. Something moved it
-- on 19 August, reclassifying every bid scoring 70 to 84 from maybe to go, and
-- nothing anywhere records who did it or why. The five dealbreakers are the
-- same: each carries a reason written in Caravann's voice and no author.
--
-- That matters more than any other unrecorded field. A sector count being wrong
-- costs a few points on one bid. The go threshold being somebody's guess means
-- every verdict the desk has ever produced rests on a number nobody has owned.
-- And it is unfalsifiable after the fact: a plausible 70 looks exactly like a
-- considered 70.
--
-- So the fields exist to say. Null means nobody has confirmed it, which the
-- settings page states plainly rather than letting a default pass for a
-- decision.
alter table scoring_settings
  add column if not exists confirmed_by text,
  add column if not exists confirmed_at timestamptz;

comment on column scoring_settings.confirmed_by is
  'Who last agreed these thresholds are right. Null means nobody has, and the numbers are a starting point rather than a decision.';

alter table hard_knockouts
  add column if not exists confirmed_by text,
  add column if not exists confirmed_at timestamptz;

comment on column hard_knockouts.confirmed_by is
  'Who said this closes a bid. Null means it was inferred during setup rather than stated by the firm.';
