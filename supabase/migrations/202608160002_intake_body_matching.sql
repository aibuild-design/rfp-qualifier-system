-- Look in the message body, not only the subject line.
--
-- Subject-only matching missed the case it was most needed for: an aggregator
-- or a contact forwards a solicitation with a subject like "thought of you" or
-- "fwd:", and the words that identify it as a solicitation are all in the body.
-- Those were never fetched at all - not triaged and rejected, never seen -
-- which looks exactly like a quiet week.
--
-- Body matching is far more permissive than subject matching, because a body is
-- long and full of other people's words. A procurement newsletter that mentions
-- an RFP in passing now qualifies, and at roughly eighteen cents a read that is
-- real money spent on mail nobody wanted. Which is what the ignore list is for:
-- it is not a nice-to-have beside this switch, it is the brake that makes the
-- switch safe to leave on.
alter table scoring_settings
  add column if not exists intake_match_body boolean not null default true;

alter table scoring_settings
  add column if not exists email_ignore_terms text[]
  not null
  default array['unsubscribe from','webinar','newsletter','survey invitation'];

comment on column scoring_settings.intake_match_body is
  'When true the qualifying terms are matched against the message body as well as the subject. The subject is always matched.';

comment on column scoring_settings.email_ignore_terms is
  'Case-insensitive substrings that disqualify an email even when it matched. Checked against subject and body together, and checked last, so it always wins.';
