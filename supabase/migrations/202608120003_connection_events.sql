-- When each outside connection last demonstrably worked.
--
-- The Connections panel derived this from the queue, which meant clearing the
-- queue erased the proof that Gmail, triage and Drive had ever worked - three
-- amber "Unproven" lines on a system that was fine minutes earlier. Health and
-- workload are different facts and should not share a lifetime.
--
-- One row per kind, overwritten. This is not an audit log; the only question it
-- answers is "when did this last work", so history would be noise that grows
-- forever.
create table if not exists connection_events (
  kind text primary key,
  last_ok_at timestamptz not null,
  detail text
);

comment on table connection_events is
  'Last time each outside connection demonstrably worked. Survives a queue reset, because clearing solicitations is not evidence that Google stopped working.';

alter table connection_events enable row level security;

-- Read-only to signed-in users; only the service role writes, and only from the
-- intake route at the moment work actually completes.
drop policy if exists "connection_events readable" on connection_events;
create policy "connection_events readable" on connection_events
  for select to authenticated using (true);
