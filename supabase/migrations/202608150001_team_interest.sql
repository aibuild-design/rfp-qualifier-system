-- What each consultant wants to work on.
--
-- Module 9 promised recommendations by fit, bandwidth AND interest. Fit and
-- bandwidth were built; interest had nowhere to live, so it could not be part of
-- the ranking. Two people equally qualified and equally free is exactly when
-- "who actually wants this" should decide, and it was the one input missing.
--
-- Free text rather than a fixed list: the useful answer is "board facilitation,
-- not K-12" and no dropdown survives contact with that.
alter table team_members
  add column if not exists interests text[] not null default '{}';

comment on column team_members.interests is
  'Work this person wants. Matched the same way qualifications are, and used to break ties between equally qualified, equally available people.';
