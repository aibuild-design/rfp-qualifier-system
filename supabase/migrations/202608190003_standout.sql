-- One line on why this solicitation is worth looking at.
--
-- The Slack message carried the first line of verdict_why, which is a
-- justification rather than a hook: it argues the score to somebody who has not
-- yet decided to care. What a notification needs is the reason this one stands
-- out from the other four that arrived this week.
--
-- Its own field rather than a truncation, because the two are written
-- differently. "Meets all four stated minimum qualifications: 5+ years of
-- public agency OD/facilitation, 3 comparable engagements, demonstrated..." is
-- a good first reason and a bad first impression.
alter table rfps add column if not exists standout text;

comment on column rfps.standout is
  'One sentence on what makes this solicitation notable, written for a notification rather than for the verdict page. Null when triage did not produce one.';
