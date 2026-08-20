-- The firm's own details, out of the source file.
--
-- Caravann's address, telephone, email, website, CAGE code, UEI, EIN and point
-- of contact were hardcoded in lib/docx-fill.ts. They go on the cover page of
-- every proposal, so a change of office or a corrected EIN meant editing code
-- and deploying, and Khaled had no way to see what was being submitted on his
-- behalf, let alone check it.
--
-- Defaults are the values that were in the file, so nothing changes on the next
-- draft. What changes is that they are now visible and editable.
alter table org_profile add column if not exists legal_name text default 'Caravann Consulting';
alter table org_profile add column if not exists address text default '2008 Ninth St, Berkeley, CA 94701';
alter table org_profile add column if not exists point_of_contact text default 'Khaled El-Sawaf';
alter table org_profile add column if not exists telephone text default '510-224-0070';
alter table org_profile add column if not exists email text default 'khaled@caravann.co';
alter table org_profile add column if not exists website text default 'https://www.caravann.co';
alter table org_profile add column if not exists cage_code text default '9NV03';
alter table org_profile add column if not exists uei text default 'HSV8KJY684V5';
alter table org_profile add column if not exists duns text default 'N/A - replaced by UEI (April 2022)';
alter table org_profile add column if not exists tax_ein text default '92-1867651';

comment on column org_profile.tax_ein is
  'Goes on the cover page of every submission. Was hardcoded in the template filler, where nobody could check it.';
