-- Folders the desk relies on, which a person should not be able to delete.
--
-- To decide, Writing, Waiting on the agency, Submitted and Archive are the
-- stages a bid moves through, not someone's filing preference. Deleting one
-- unfiles every solicitation in it and leaves a stage of the process with
-- nowhere to sit, and there is no undo.
--
-- Renaming stays allowed. The word is the user's; the stage is the desk's.
alter table rfp_folders
  add column if not exists is_system boolean not null default false;

update rfp_folders
   set is_system = true
 where name in ('To decide', 'Writing', 'Waiting on the agency', 'Submitted', 'Archive');

comment on column rfp_folders.is_system is
  'A stage of the pipeline rather than a folder someone made. Renameable, never deletable.';
