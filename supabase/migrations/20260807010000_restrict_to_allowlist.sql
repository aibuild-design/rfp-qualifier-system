-- Restrict every table to an explicit allowlist of people.
--
-- WHY: the original policies granted full read/write to anyone holding the
-- `authenticated` role. Supabase's signup endpoint is open by default and the
-- anon key is, by design, public — it ships in the browser bundle. Together
-- that meant anybody could self-register with any email address, confirm it,
-- and read Caravann's entire bid pipeline: which solicitations they are
-- chasing, their scores, their gap lists, their pricing signals. Verified
-- against the live project, not theorised: a throwaway account was created
-- with nothing but the public anon key, then deleted.
--
-- This migration is the durable half of the fix — even with signup wide open,
-- a new account now sees nothing. Turning signup off in the Supabase dashboard
-- is still worth doing (see SECURITY.md), but the system no longer depends on
-- it being off.
--
-- The service-role key bypasses RLS entirely, so the n8n intake path is
-- unaffected by any of this.

create table if not exists app_users (
  email      text primary key,
  note       text,
  added_at   timestamptz not null default now()
);

comment on table app_users is
  'Allowlist of people permitted to use the dashboard. Managed with the '
  'service-role key (scripts/manage-access.mjs) — deliberately not writable '
  'from the browser, or an allowlisted user could add anyone.';

alter table app_users enable row level security;

-- Matches on the JWT email claim. SECURITY DEFINER so the check can read
-- app_users even though app_users itself is locked down; the fixed search_path
-- stops a caller shadowing the table with their own.
create or replace function public.is_app_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from app_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_app_user() from public;
grant execute on function public.is_app_user() to authenticated;

-- Replace the blanket authenticated policies on every table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'org_profile', 'sector_experience', 'team_members', 'rfps',
    'rfp_disqualifier_checks', 'rfp_gap_items', 'rfp_compliance_items',
    'rfp_questions', 'rfp_team_assignments', 'rfp_files', 'rfp_edge_cases',
    'portal_rules'
  ]
  loop
    execute format('drop policy if exists "Authenticated read/write" on %I', t);
    execute format('drop policy if exists "Allowlisted read/write" on %I', t);
    execute format(
      'create policy "Allowlisted read/write" on %I for all '
      'using (public.is_app_user()) with check (public.is_app_user())',
      t
    );
  end loop;
end $$;

-- profiles carried its own pair of policies rather than the shared one.
drop policy if exists "Authenticated read" on profiles;
drop policy if exists "Own row write" on profiles;
drop policy if exists "Allowlisted read" on profiles;
drop policy if exists "Own row write, allowlisted" on profiles;

create policy "Allowlisted read" on profiles for select
  using (public.is_app_user());
create policy "Own row write, allowlisted" on profiles for update
  using (public.is_app_user() and auth.uid() = id)
  with check (public.is_app_user() and auth.uid() = id);

-- An allowlisted user can see who else has access, but cannot grant it.
drop policy if exists "Allowlisted read" on app_users;
create policy "Allowlisted read" on app_users for select
  using (public.is_app_user());

-- Seed the one real account that exists today. Add Khaled's with:
--   node scripts/manage-access.mjs add khaled@caravann.co
insert into app_users (email, note)
values ('d4nielm7@gmail.com', 'Deep Loom — build account')
on conflict (email) do nothing;
