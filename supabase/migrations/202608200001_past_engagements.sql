-- Work Caravann has actually done, as records rather than prose.
--
-- Past performance lived as a single language block: one paragraph about UCSF,
-- written once, reused whatever the solicitation asked for. That is the wrong
-- shape for it. An agency scoring past performance wants the client, the dates,
-- what was delivered and somebody it can telephone, and it wants the
-- engagements closest to its own situation rather than whichever paragraph
-- happens to exist.
--
-- As records, the desk can choose. A K-12 solicitation gets the education work,
-- a transit one gets SamTrans, and adding an engagement is answering fields
-- rather than writing a paragraph in the right voice.
create table if not exists past_engagements (
  id uuid primary key default gen_random_uuid(),
  client text not null,
  -- What kind of organisation, so relevance can be judged against a sector.
  client_type text,
  sector text,
  title text not null,
  started_on date,
  ended_on date,
  contract_value numeric,
  -- The three things an evaluator actually reads.
  situation text,
  what_we_did text,
  outcome text,
  -- Agencies routinely ask for three contactable references, and a reference
  -- nobody may call is worth very little.
  reference_name text,
  reference_title text,
  reference_email text,
  reference_phone text,
  reference_contactable boolean not null default true,
  -- Won work outranks work merely proposed, the same rule the language library
  -- already applies to blocks.
  won boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists past_engagements_sector_idx on past_engagements (sector);

comment on table past_engagements is
  'Engagements Caravann can cite as past performance. Structured so the desk can pick the ones closest to a solicitation rather than reusing one paragraph.';

alter table past_engagements enable row level security;
drop policy if exists past_engagements_authenticated on past_engagements;
create policy past_engagements_authenticated on past_engagements
  for all to authenticated using (true) with check (true);
