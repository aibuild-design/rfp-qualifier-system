-- Where the finished draft lives in Drive.
--
-- The proposal used to be filed during triage, back when it was built during
-- triage. Now it is built when Khaled asks for one, and nothing was carrying it
-- to Drive afterwards: the draft existed in the dashboard and as a .docx
-- download, and "open the draft" could only ever mean "download a file".
--
-- Null until the draft has been built and filed, which is most of a bid's life.
alter table rfps add column if not exists proposal_doc_url text;

comment on column public.rfps.proposal_doc_url is
  'Google Doc of the built proposal, filed into the bid folder. Null until a draft has been built.';
