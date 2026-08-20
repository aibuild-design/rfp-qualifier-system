-- Keep the proposals themselves, not only what was taken from them.
--
-- Ingestion read a thirty-nine page proposal, pulled thirty-two passages out of
-- it, and discarded the document. Everything not selected in that one pass was
-- gone, and improving the extraction later would mean asking Khaled to find and
-- upload the file again.
--
-- The full text is cheap to keep and expensive to re-obtain. Storing it means a
-- better prompt next month can be run over everything already uploaded, and a
-- question the blocks cannot answer can be answered by searching the source.
--
-- Deliberately NOT sent to the model at draft time. A proposal is a hundred
-- thousand characters; the whole point of the library is that the useful ten
-- percent has been separated out. This is an archive, and the blocks are the
-- working set.
create table if not exists source_documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- What it is, so a past proposal is not confused with a solicitation.
  kind text not null default 'proposal' check (kind in ('proposal', 'solicitation', 'other')),
  -- The extracted text, which is what any future re-read would use.
  body text not null,
  characters integer not null,
  -- How many blocks were taken the first time, so a re-read can be compared.
  blocks_taken integer not null default 0,
  uploaded_at timestamptz not null default now()
);

create index if not exists source_documents_kind_idx on source_documents (kind, uploaded_at desc);

comment on table source_documents is
  'Full text of proposals and documents uploaded to learn from. An archive for re-reading, never sent to the model at draft time: the library is the working extract.';

alter table source_documents enable row level security;
drop policy if exists source_documents_authenticated on source_documents;
create policy source_documents_authenticated on source_documents
  for all to authenticated using (true) with check (true);
