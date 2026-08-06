-- RFP Qualifier — Caravann Phase 1 domain schema.
-- Matches the signed SOW's 11 modules (see Scope_Khaled_RFP_BidDesk.md):
-- intake -> qualification/triage -> sector depth -> gap list -> budget ->
-- compliance checklist -> question memo -> proposal assembly -> team match
-- -> filing -> human review.
--
-- Data flow: n8n reads/parses RFPs and calls OpenRouter for triage, then
-- POSTs the result to this app's /api/rfps/intake route (service-role
-- client, bypasses RLS). The dashboard (browser/session client, RLS-scoped)
-- only reads that data, plus writes the org profile, sector map, and team
-- roster directly (those are Khaled's one-time/occasional edits, not
-- n8n-generated).
--
-- Single-tenant (Caravann only) — RLS is "any authenticated user can
-- read/write everything," same as the sibling Goldhill Group schema. If
-- this ever serves a second client, add a workspace_id column and switch
-- these policies to scope by it — don't reuse this migration as multi-tenant
-- as-is.
--
-- Proposal assembly (module 8) and the approved-language library live in
-- Caravann's Google Drive, not this database — nothing to model here beyond
-- a pointer (rfp_files.drive_url) to where the draft ended up.

create extension if not exists "pgcrypto";

-- ── org_profile ──────────────────────────────────────────────────────────────
-- Singleton row: the eligibility profile the disqualifier gate and scoring
-- read from (module 3). Confirmed once by Khaled, updated as it changes.
create table if not exists org_profile (
  id                        boolean primary key default true,
  bilingual_staff           boolean not null default false,
  media_production_capable  boolean not null default false,
  pr_capable                boolean not null default false,
  office_locations          text[] not null default '{}',
  consultant_locations      text[] not null default '{}',
  certifications            text[] not null default '{}',
  set_aside_status          text[] not null default '{}',
  notes                     text,
  updated_at                timestamptz not null default now(),
  constraint org_profile_singleton check (id)
);

comment on table org_profile is
  'One row only (id is always true) — the org-wide eligibility profile, not per-RFP.';

-- ── sector_experience ────────────────────────────────────────────────────────
-- Years/engagements per sector (K-12, behavioral health, transit, public
-- agencies, ...) — the "knows your depth" map from module 3.
create table if not exists sector_experience (
  id                uuid primary key default gen_random_uuid(),
  sector            text not null unique,
  years_experience  numeric,
  engagement_count  integer,
  notes             text,
  updated_at        timestamptz not null default now()
);

-- ── team_members ─────────────────────────────────────────────────────────────
-- The private roster module 9's team match recommends against.
create table if not exists team_members (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  role          text,
  rate          numeric,
  qualifications text[] not null default '{}',   -- what minimum quals this person satisfies
  bandwidth     text check (bandwidth in ('open', 'limited', 'full')) default 'open',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ── rfps ─────────────────────────────────────────────────────────────────────
-- One row per solicitation. Never deleted — no-go RFPs stay, filed with a
-- reason, same "labeled not hidden" standard as the sibling schema.
create table if not exists rfps (
  id                   uuid primary key default gen_random_uuid(),
  external_id          text unique,              -- n8n's idempotency key (source system's RFP id/url hash)
  title                text not null,
  client_agency        text not null,
  project_type         text,
  source                text check (source in ('aggregator', 'email', 'manual', 'portal')) default 'manual',
  source_url           text,
  drive_folder_url     text,                      -- per-RFP subfolder once filed (module 10)

  received_at          timestamptz not null default now(),
  due_at               timestamptz,               -- submission deadline
  question_deadline_at timestamptz,

  budget_amount        numeric,
  budget_source        text not null default 'none_listed'
                          check (budget_source in ('rfp', 'qa_document', 'none_listed')),

  -- verdict (module 2)
  status               text not null default 'pending'
                          check (status in ('pending', 'go', 'no_go', 'maybe')),
  score_percent        numeric check (score_percent >= 0 and score_percent <= 100),
  verdict_why          text,
  verdict_why_not      text,
  verdict_set_at       timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on column rfps.status is
  'pending = intake done, triage not run or in flight. go/maybe/no_go = verdict '
  'delivered — no_go stays in the table with reasoning, never deleted.';
comment on column rfps.budget_source is
  'rfp = read from the solicitation itself. qa_document = only appeared in a '
  'Q&A doc. none_listed = stated absence, shown verbatim on the card rather '
  'than a guess — the aggregator''s estimate is never used as this value.';

create index if not exists rfps_status_idx on rfps (status);
create index if not exists rfps_due_at_idx on rfps (due_at);
create index if not exists rfps_score_idx on rfps (score_percent desc);

-- ── rfp_disqualifier_checks ──────────────────────────────────────────────────
-- The hard-gate checklist run against org_profile / sector_experience for
-- this specific RFP (module 2). "Required" that fails is a hard knockout;
-- "preferred" that fails only lowers score_percent on the parent row.
create table if not exists rfp_disqualifier_checks (
  id               uuid primary key default gen_random_uuid(),
  rfp_id           uuid not null references rfps (id) on delete cascade,
  requirement_text text not null,
  is_required      boolean not null default true,   -- false = "preferred" wording
  result           text not null check (result in ('pass', 'fail', 'not_applicable')),
  is_hard_knockout boolean not null default false,   -- Khaled-confirmed dealbreaker, forces no_go regardless of wording
  notes            text,
  created_at       timestamptz not null default now()
);

create index if not exists rfp_disqualifier_checks_rfp_idx on rfp_disqualifier_checks (rfp_id);

-- ── rfp_gap_items ─────────────────────────────────────────────────────────────
-- The teaming shopping list (module 4) — everything Caravann is short on for
-- this specific RFP.
create table if not exists rfp_gap_items (
  id          uuid primary key default gen_random_uuid(),
  rfp_id      uuid not null references rfps (id) on delete cascade,
  gap_type    text not null check (gap_type in
                ('experience', 'sector', 'certification', 'staffing', 'geography', 'other')),
  description text not null,
  created_at  timestamptz not null default now()
);

create index if not exists rfp_gap_items_rfp_idx on rfp_gap_items (rfp_id);

-- ── rfp_compliance_items ─────────────────────────────────────────────────────
-- Everything that can disqualify on a technicality (module 6): deadlines,
-- page/section limits, formatting, submission mechanics, insurance, rubric
-- weights. due_at populated only for deadline-type rows, drives the
-- countdown (yellow < 7 days, red < 3 days) on the dashboard.
create table if not exists rfp_compliance_items (
  id          uuid primary key default gen_random_uuid(),
  rfp_id      uuid not null references rfps (id) on delete cascade,
  category    text not null check (category in
                ('deadline', 'page_limit', 'format', 'submission', 'insurance', 'rubric', 'other')),
  label       text not null,
  detail      text,
  due_at      timestamptz,
  is_complete boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists rfp_compliance_items_rfp_idx on rfp_compliance_items (rfp_id);
create index if not exists rfp_compliance_items_due_idx on rfp_compliance_items (due_at);

-- ── rfp_questions ─────────────────────────────────────────────────────────────
-- Module 7's two lanes: the public strategic memo, and the private
-- incumbent/prior-winning-proposal request to the named contact.
create table if not exists rfp_questions (
  id            uuid primary key default gen_random_uuid(),
  rfp_id        uuid not null references rfps (id) on delete cascade,
  lane          text not null check (lane in ('public_memo', 'incumbent_request')),
  question_text text not null,
  status        text not null default 'drafted' check (status in ('drafted', 'approved', 'sent')),
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists rfp_questions_rfp_idx on rfp_questions (rfp_id);

-- ── rfp_team_assignments ─────────────────────────────────────────────────────
-- Module 9's recommendation — never auto-assigned, Khaled confirms.
create table if not exists rfp_team_assignments (
  id             uuid primary key default gen_random_uuid(),
  rfp_id         uuid not null references rfps (id) on delete cascade,
  team_member_id uuid not null references team_members (id) on delete cascade,
  status         text not null default 'recommended' check (status in ('recommended', 'confirmed')),
  notes          text,
  created_at     timestamptz not null default now(),
  unique (rfp_id, team_member_id)
);

-- ── rfp_files ─────────────────────────────────────────────────────────────────
-- Pointers into the Drive folder structure module 10 files everything into —
-- the RFP itself, addenda, the compliance checklist export, the draft.
create table if not exists rfp_files (
  id         uuid primary key default gen_random_uuid(),
  rfp_id     uuid not null references rfps (id) on delete cascade,
  file_type  text not null check (file_type in ('rfp', 'addendum', 'draft', 'form', 'other')),
  name       text not null,
  drive_url  text,
  uploaded_at timestamptz not null default now()
);

create index if not exists rfp_files_rfp_idx on rfp_files (rfp_id);

-- ── rfp_edge_cases ────────────────────────────────────────────────────────────
-- The weekly digest (module 11) — every edge case the system was unsure
-- about, plus a proposed rule change. Nothing here changes behavior until
-- Khaled approves it.
create table if not exists rfp_edge_cases (
  id                   uuid primary key default gen_random_uuid(),
  rfp_id               uuid references rfps (id) on delete set null,
  description          text not null,
  proposed_rule_change text,
  status               text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at           timestamptz not null default now(),
  resolved_at          timestamptz
);

-- ── portal_rules ──────────────────────────────────────────────────────────────
-- "Teach it a portal rule once" (module 11) — e.g. one agency wants
-- references merged into a single PDF, another excludes resumes from the
-- page count. Surfaced back onto rfp_compliance_items for that portal going
-- forward.
create table if not exists portal_rules (
  id           uuid primary key default gen_random_uuid(),
  portal_name  text not null,
  rule_text    text not null,
  created_at   timestamptz not null default now()
);

-- ── updated_at trigger ────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists rfps_set_updated_at on rfps;
create trigger rfps_set_updated_at
  before update on rfps
  for each row execute function set_updated_at();

drop trigger if exists org_profile_set_updated_at on org_profile;
create trigger org_profile_set_updated_at
  before update on org_profile
  for each row execute function set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Single-tenant: any signed-in user (Khaled + team) reads/writes everything.
-- The n8n intake route uses the service-role key and bypasses RLS entirely —
-- this only governs what the dashboard's browser/session client sees.
alter table org_profile enable row level security;
alter table sector_experience enable row level security;
alter table team_members enable row level security;
alter table rfps enable row level security;
alter table rfp_disqualifier_checks enable row level security;
alter table rfp_gap_items enable row level security;
alter table rfp_compliance_items enable row level security;
alter table rfp_questions enable row level security;
alter table rfp_team_assignments enable row level security;
alter table rfp_files enable row level security;
alter table rfp_edge_cases enable row level security;
alter table portal_rules enable row level security;

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
    if not exists (
      select 1 from pg_policies where tablename = t and policyname = 'Authenticated read/write'
    ) then
      execute format(
        'create policy "Authenticated read/write" on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
        t
      );
    end if;
  end loop;
end $$;

insert into org_profile (id) values (true) on conflict (id) do nothing;
