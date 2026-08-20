-- The fields the template's past-performance blocks ask for and nothing stored.
--
-- Caravann's template does not treat past performance as prose: each of its
-- three numbered blocks asks for a contract identifier, a contract type and the
-- role the firm held, beside the amount and period already recorded. Those
-- three had nowhere to live, so the proposal filler passed null and the
-- document carried "To be supplied by Caravann" on every one of them.
--
-- Nullable, because an engagement genuinely may not have a contract number, and
-- a visible blank on a government form is better than a confident guess.
alter table public.past_engagements
  add column if not exists contract_number text,
  add column if not exists contract_type text,
  add column if not exists project_role text;

comment on column public.past_engagements.contract_number is
  'Contract or purchase order identifier, as the buyer would verify it.';
comment on column public.past_engagements.contract_type is
  'FFP, T&M, Labor Hour, CPFF and so on. Named on the reference block.';
comment on column public.past_engagements.project_role is
  'Prime, Sub or Vendor.';

-- The soliciting agency's own contact details, printed on the cover page.
--
-- The template has four red fields for them and the extractor never captured
-- any, so every draft went out with "[Insert Agency Address]" on its front page.
alter table public.rfps
  add column if not exists agency_address text,
  add column if not exists agency_poc_name text,
  add column if not exists agency_poc_phone text,
  add column if not exists agency_poc_email text;
