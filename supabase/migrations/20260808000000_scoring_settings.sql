-- Scoring settings - the dials that decide a verdict, moved out of code.
--
-- The label used to be the model's choice and was not reproducible: one
-- solicitation, three runs, came back maybe/83, go/87, go/88. lib/verdict.ts
-- made the label arithmetic; this puts the arithmetic's inputs where Khaled
-- can change them, because where the go/no-go line sits is a business
-- judgement about his firm's appetite for risk, not an engineering constant.
--
-- Singleton, same shape as org_profile: one row, `id` fixed to true, so there
-- is no "which settings row is live?" question to get wrong.

create table if not exists scoring_settings (
  id boolean primary key default true check (id),

  -- Score at or above which a solicitation is a clear go.
  go_threshold integer not null default 85 check (go_threshold between 0 and 100),
  -- Score at or above which it is worth a second look. Below this, no-go.
  maybe_threshold integer not null default 60 check (maybe_threshold between 0 and 100),

  -- Deadline countdown colouring, per the SOW: yellow inside a week, red
  -- inside three days. Configurable because how much runway a bid needs is
  -- Caravann's call, not ours.
  deadline_warning_days integer not null default 7 check (deadline_warning_days between 1 and 90),
  deadline_critical_days integer not null default 3 check (deadline_critical_days between 1 and 90),

  -- When true, a *preferred* requirement that Caravann misses also closes the
  -- bid. Off by default: the SOW is explicit that preferred lowers the score
  -- rather than killing it, and turning this on will rule out winnable work.
  preferred_misses_are_fatal boolean not null default false,

  notes text,
  updated_at timestamptz not null default now(),

  -- A maybe band that sits above the go line is not a stricter setting, it is
  -- an incoherent one - every score would be a maybe and nothing could ever
  -- be a go. Rejected at the database so no UI bug can produce it.
  constraint maybe_below_go check (maybe_threshold <= go_threshold)
);

insert into scoring_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists scoring_settings_set_updated_at on scoring_settings;
create trigger scoring_settings_set_updated_at
  before update on scoring_settings
  for each row execute function set_updated_at();

-- Same allowlist gate as every other table. A new table has no access until a
-- policy exists, so this is required rather than belt-and-braces.
alter table scoring_settings enable row level security;

drop policy if exists "Allowlisted read/write" on scoring_settings;
create policy "Allowlisted read/write" on scoring_settings
  for all using (public.is_app_user()) with check (public.is_app_user());
