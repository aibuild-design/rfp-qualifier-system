-- RFP Qualifier - starter migration.
--
-- This is intentionally the bare minimum: a profiles table synced to
-- auth.users, so login/signup has somewhere to attach a display name, plus
-- the standard auth-trigger + RLS scaffolding every Supabase project needs.
--
-- No RFP-specific tables yet - the qualification schema (RFPs, criteria,
-- scoring, review workflow) depends on scope that hasn't been defined.
-- Add it in a follow-up migration once that's settled; don't extend this
-- file after it's been applied to a real project.

create extension if not exists "pgcrypto";

-- ── profiles ─────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  created_at  timestamptz not null default now()
);

-- Keep profiles.email in sync and auto-create a row on signup.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Single-tenant for now: any authenticated user can read every profile
-- (needed for things like an assignee picker later), but can only edit
-- their own row.
alter table profiles enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'Authenticated read') then
    create policy "Authenticated read" on profiles for select
      using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'Own row write') then
    create policy "Own row write" on profiles for update
      using (auth.uid() = id) with check (auth.uid() = id);
  end if;
end $$;
