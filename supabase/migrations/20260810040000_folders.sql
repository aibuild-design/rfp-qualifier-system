-- Folders, so the queue can be organised the way a desk actually gets organised.
--
-- The queue sorts by score and filters by verdict, which answers "what is
-- worth doing" but not "what am I working on this month", "what is the transit
-- pile", or "what did we bid last quarter". Those are groupings only Khaled can
-- make, and a system that cannot hold them ends up alongside a spreadsheet that
-- can.
--
-- Nesting via parent_id, so folders can be grouped rather than living in one
-- flat list. Deleting a parent takes its subfolders with it, which is what
-- dragging a folder to the bin means everywhere else.
create table if not exists public.rfp_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  parent_id uuid references public.rfp_folders(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rfp_folders_parent_idx on public.rfp_folders (parent_id);

-- ON DELETE SET NULL, emphatically not CASCADE.
--
-- Deleting a folder must never delete the solicitations inside it. A folder is
-- a label; the bids are the work, and several of them represent contracts worth
-- more than this entire system. Losing a folder returns its contents to the
-- unfiled queue, where they are still visible and still have their verdicts.
alter table public.rfps
  add column if not exists folder_id uuid references public.rfp_folders(id) on delete set null;

create index if not exists rfps_folder_idx on public.rfps (folder_id);

comment on column public.rfps.folder_id is
  'Which folder this sits in, or null for unfiled. Set null on folder delete - removing a label must never remove the bid.';

-- Same allowlist gate as every other table: RLS on, and only accounts in
-- app_users can see or change anything.
alter table public.rfp_folders enable row level security;

drop policy if exists "Allowlisted read/write" on public.rfp_folders;
create policy "Allowlisted read/write" on public.rfp_folders
  for all using (public.is_app_user()) with check (public.is_app_user());
