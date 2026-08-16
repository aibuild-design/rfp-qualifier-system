-- Documents that go out with every submission.
--
-- Module 8 promised standing documents and they were never built, so the
-- insurance certificate, the W-9 and the signed federal certifications sat in
-- somebody's Drive and were remembered, or not, by hand. The failure mode is
-- the expensive one: a submission that is complete except for the one page
-- that makes it non-responsive.
--
-- The file itself lives in the private `client-documents` bucket, the same one
-- the RFP template uses. Only the pointer is here, because these carry a Tax
-- EIN and signatures and nothing in this repository should be able to leak one.
--
-- No rfp_id. That is the point of the word standing: these attach to every
-- submission rather than being chosen per bid, and a per-bid join would turn
-- "always include this" into "remember to add this", which is what already
-- does not work.
create table if not exists standing_documents (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  file_name text not null,
  storage_path text not null unique,
  -- Kept so the checklist can say when it was last refreshed. An insurance
  -- certificate is only useful until it expires, and one that lapsed in March
  -- is worse than none: it is attached with confidence.
  expires_on date,
  added_at timestamptz not null default now()
);

comment on table standing_documents is
  'Files attached to every submission. The file lives in the private client-documents bucket; only the pointer is stored here.';

alter table standing_documents enable row level security;

drop policy if exists standing_documents_authenticated on standing_documents;
create policy standing_documents_authenticated on standing_documents
  for all to authenticated using (true) with check (true);
