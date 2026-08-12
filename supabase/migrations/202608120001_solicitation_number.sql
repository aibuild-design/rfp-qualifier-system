-- The agency's own reference for the solicitation - "RFP No. SC-2026-77".
--
-- It was being taken from external_id, which is n8n's dedupe key and is
-- documented as such. For a solicitation that arrived by email that key is
-- "gmail-19ff705ed2230acc", and it was printed on the proposal cover page and
-- in the header of every page: an internal message id shown to the evaluator
-- where their own solicitation number belongs.
--
-- Nullable on purpose. Not every notice states a number, and a blank field is
-- honest where a wrong one is not.
alter table rfps add column if not exists solicitation_number text;

comment on column rfps.solicitation_number is
  'The agency''s solicitation number as printed in the document. Never derive this from external_id, which is an internal dedupe key.';
