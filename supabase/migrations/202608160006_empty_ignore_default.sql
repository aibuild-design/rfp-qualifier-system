-- Ship the ignore list empty.
--
-- It went out defaulted to 'unsubscribe from', 'webinar', 'newsletter' and
-- 'survey invitation', reasoned from the wrong mailbox. aibuild@caravann.co is
-- not a general inbox that happens to receive solicitations; it is a dedicated
-- address whose main traffic is aggregator alerts. Almost every one of those
-- carries "unsubscribe from" in its footer, and a fair number describe
-- themselves as newsletters.
--
-- Body matching went live in the same change, and the ignore list is checked
-- against the body. So the two together would have dropped the exact mail this
-- desk exists to catch, and dropped it silently: an email that never matches is
-- never fetched, which looks identical to a quiet week.
--
-- The mechanism stays. It is the right brake to have and costs nothing sitting
-- unused, and Khaled can add a term the day something noisy actually arrives.
-- What was wrong was guessing at that list before seeing the mail.
alter table scoring_settings
  alter column email_ignore_terms set default '{}';

update scoring_settings
  set email_ignore_terms = '{}'
  where email_ignore_terms = array['unsubscribe from','webinar','newsletter','survey invitation'];

comment on column scoring_settings.email_ignore_terms is
  'Case-insensitive substrings that disqualify an email even when it matched. Checked against subject and body together, and checked last, so it always wins. Empty by default: a term here silently drops mail, and aggregator footers make broad terms dangerous.';
