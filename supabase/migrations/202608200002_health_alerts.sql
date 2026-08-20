-- When each connection was last complained about, so a warning is sent once
-- rather than on every check.
--
-- A health alert that repeats every few minutes is read twice and muted after
-- that, which leaves the desk in exactly the state the alert exists to prevent.
alter table public.connection_events
  add column if not exists last_alerted_at timestamptz;

comment on column public.connection_events.last_alerted_at is
  'Last time a degraded state for this connection was announced. Null once it recovers, so the next failure speaks up again.';
