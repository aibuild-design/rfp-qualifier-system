-- Addenda and answer sets, attached to the bid they belong to.
--
-- Khaled sent three real documents that showed the gap. Two of them, an
-- addendum and a clarifying-questions set, both belong to Clackamas County RFP
-- 2026-25. Arriving at the desk today they would have become two more rows in
-- the queue, unconnected to the solicitation they amend, and the addendum's
-- changes would have reached nobody.
--
-- That addendum moves a deadline and deletes fifteen points of scoring weight.
-- The Q&A reverses a page limit the desk would already have recorded as a
-- compliance item. Filed as separate bids, both are invisible; attached to the
-- bid, they are the reason to look at it again.
create table if not exists rfp_related_documents (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid not null references rfps (id) on delete cascade,
  kind text not null check (kind in ('addendum', 'clarifying_questions', 'notice')),
  -- Addendum 2 supersedes Addendum 1, so the order has to survive.
  sequence integer,
  title text,
  -- The full text, because an amendment is evidence: what it changed has to be
  -- readable next to the bid a year later.
  body text,
  source_url text,
  drive_url text,
  received_at timestamptz not null default now()
);

create index if not exists rfp_related_documents_rfp_idx
  on rfp_related_documents (rfp_id, kind, sequence);

comment on table rfp_related_documents is
  'Addenda, clarifying-question sets and posting notices, attached to the solicitation they concern rather than filed as separate bids.';

alter table rfp_related_documents enable row level security;
drop policy if exists rfp_related_documents_authenticated on rfp_related_documents;
create policy rfp_related_documents_authenticated on rfp_related_documents
  for all to authenticated using (true) with check (true);

-- Raised when an amendment lands, because the desk cannot decide what a moved
-- deadline means for a bid Khaled has already accepted. That is his call, and
-- the point is that he is told rather than the change arriving silently.
alter table rfps add column if not exists has_unreviewed_amendment boolean not null default false;

comment on column rfps.has_unreviewed_amendment is
  'True from the moment an addendum or answer set is attached until a person has looked at it. The verdict is deliberately not recomputed: an amendment can move a deadline or reweight scoring, and what that means is a judgement.';
