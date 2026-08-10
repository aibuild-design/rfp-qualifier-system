-- Stop placeholder-based verdicts from looking authoritative.
--
-- The eligibility profile ships pre-filled with plausible figures so there is
-- something to demonstrate against and so Khaled confirms numbers rather than
-- facing a blank form. That is the right default, but it means the desk will
-- happily produce a confident-looking go/no-go from data nobody has verified —
-- and the Gmail trigger is live, so real solicitations will hit it.
--
-- Two columns, because there are two different questions:
--
--   org_profile.profile_confirmed  — has a human signed off on this profile?
--   rfps.is_provisional            — was the profile signed off *at the time
--                                    this particular verdict was computed*?
--
-- The second matters more than it looks. A verdict computed against an
-- unconfirmed profile does not become trustworthy later just because someone
-- ticked a box afterwards; it needs re-triaging. Recording the state per row
-- keeps that honest instead of retroactively blessing old calls.
alter table public.org_profile
  add column if not exists profile_confirmed boolean not null default false;

comment on column public.org_profile.profile_confirmed is
  'Set by a human on the settings screen once the locations, capabilities, certifications, insurance and sector map have been checked against reality. Until then every verdict is stored as provisional.';

alter table public.rfps
  add column if not exists is_provisional boolean not null default false;

comment on column public.rfps.is_provisional is
  'True when this verdict was computed while the eligibility profile was unconfirmed. Never cleared automatically — confirming the profile afterwards does not make an old verdict correct, only a re-triage does.';

-- Everything already in the table was scored against the placeholder profile.
update public.rfps set is_provisional = true where is_provisional = false;
