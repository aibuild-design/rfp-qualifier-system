-- Every build of a proposal, kept.
--
-- Rebuilding replaced rfp_proposal_sections in place and filed a fresh Google
-- Doc, so the previous draft survived only as an orphaned file in Drive with
-- the same name as the new one. Two identical titles already sit in the live
-- bid folder and nothing records which is which or when either was made. A
-- rebuild after a bad edit was unrecoverable, and there was no way to see what
-- an amendment had changed about a draft.
--
-- The whole proposal is stored as text rather than one row per section. It is
-- read, occasionally diffed, and never queried by section, so fourteen rows
-- per build would be fourteen times the bookkeeping for nothing. A build is
-- about 40KB; a busy bid with twenty rebuilds is under a megabyte.
create table if not exists proposal_versions (
  id uuid primary key default gen_random_uuid(),
  rfp_id uuid not null references rfps (id) on delete cascade,
  -- Monotonic per bid, so "version 3" means something to a person. Assigned by
  -- the writer, not a sequence, because it has to restart per rfp.
  version integer not null,
  created_at timestamptz not null default now(),
  -- What the reader needs before deciding to open it.
  word_count integer not null default 0,
  section_count integer not null default 0,
  -- How many sections were written for this solicitation rather than stitched
  -- from the library. The single most useful number about a draft: a build
  -- with zero written is a build that silently fell back.
  written_count integer not null default 0,
  -- The Doc this build produced. Kept per version so an old draft is still
  -- reachable in Drive rather than only in here.
  doc_url text,
  -- The full proposal, headings and all.
  body text not null default '',
  -- Why this build happened, when anything is known: a rebuild after an
  -- amendment is a different event from the first draft.
  note text,
  unique (rfp_id, version)
);

create index if not exists proposal_versions_rfp_idx
  on proposal_versions (rfp_id, version desc);

comment on table proposal_versions is
  'A snapshot of every proposal build, so an earlier draft can be read after a rebuild has replaced it. Rebuilds overwrite rfp_proposal_sections; this is the only record that they happened.';

alter table proposal_versions enable row level security;
drop policy if exists proposal_versions_authenticated on proposal_versions;
create policy proposal_versions_authenticated on proposal_versions
  for all to authenticated using (true) with check (true);
