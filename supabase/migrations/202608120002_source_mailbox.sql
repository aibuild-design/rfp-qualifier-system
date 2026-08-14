-- Which mailbox a solicitation actually arrived at.
--
-- Settings can say whether Gmail is working but not which Google account it is
-- working as, and "connected" without "connected to what" is the half of the
-- answer that does not help: a credential silently re-authorised against a
-- personal account looks identical from the outside.
--
-- Read off the incoming message rather than configured, so it cannot claim an
-- account the desk is not actually reading. Nullable - a solicitation added by
-- hand arrived at no mailbox at all.
alter table rfps add column if not exists source_mailbox text;

comment on column rfps.source_mailbox is
  'The address this solicitation was received at, taken from the message. Evidence of which Google account the desk reads, not configuration.';
