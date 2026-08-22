-- Keep the document the verdict was made from.
--
-- Triage read the solicitation, derived requirements, compliance items and a
-- rubric, and then discarded it. Nothing in the database held the text. The
-- only copy was a .txt file n8n dropped in the Drive folder, which nothing
-- reads back.
--
-- That is survivable while a bid is drafted the same week and quietly wrong
-- afterwards. Khaled accepts a solicitation months after it lands, and the
-- proposal is then written from a list of extracted requirements by a composer
-- that has never seen the RFP. It cannot mirror the agency's own words, cannot
-- follow the order the solicitation asked its questions in, and cannot quote a
-- clause back. Caravann's own SamTrans proposal does all three, which is most
-- of why it reads like a person wrote it.
--
-- Stored against the bid rather than in a cache, because the point is that it
-- is still there in five months.
alter table source_documents
  add column if not exists rfp_id uuid references rfps (id) on delete cascade;

create index if not exists source_documents_rfp_idx on source_documents (rfp_id, kind);

comment on column source_documents.rfp_id is
  'The bid this document belongs to. Null for firm-wide material such as a past proposal ingested into the language library.';

-- The library ingests proposals; intake now archives solicitations, and the
-- amendments that change them.
alter table source_documents drop constraint if exists source_documents_kind_check;
alter table source_documents add constraint source_documents_kind_check
  check (kind in ('proposal', 'case_study', 'solicitation', 'addendum', 'clarifying_questions'));
