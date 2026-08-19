-- The items Khaled says are real dealbreakers.
--
-- Module 2 states it plainly: "You can also mark specific items on your own
-- list as hard knockouts, so the ones your history says are real dealbreakers,
-- behavioral health for instance, force a no-go."
--
-- What existed was one switch for all preferred requirements at once, which is
-- the opposite of specific: either every preferred miss killed a bid or none
-- did. Behavioral health could not be a dealbreaker without making a preferred
-- font size one too.
--
-- Stored as terms rather than a fixed list, because the dealbreakers come from
-- Caravann's own history of losing bids and only Khaled knows what that
-- history is.
create table if not exists hard_knockouts (
  id uuid primary key default gen_random_uuid(),
  -- Matched case-insensitively against the requirement text.
  term text not null unique,
  -- Why this one is fatal, in his words. Shown on the verdict so a closed bid
  -- always says who closed it and on what grounds.
  reason text,
  created_at timestamptz not null default now()
);

comment on table hard_knockouts is
  'Requirement subjects Khaled has marked as genuine dealbreakers. A required requirement matching one of these closes the bid outright rather than costing score.';

alter table hard_knockouts enable row level security;
drop policy if exists hard_knockouts_authenticated on hard_knockouts;
create policy hard_knockouts_authenticated on hard_knockouts
  for all to authenticated using (true) with check (true);
