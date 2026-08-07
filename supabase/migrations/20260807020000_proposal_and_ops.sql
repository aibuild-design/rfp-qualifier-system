-- Skeletal schema for the SOW modules that had none: proposal assembly (8),
-- Drive filing (10), and the operations loop (11). Also the bits of team match
-- (9) and the question memo (7) that were storage-only.
--
-- Skeletal means the tables, relationships and constraints are real and the
-- app reads and writes them — not that the modules are finished. Two things
-- are explicitly deferred because they need OAuth this build cannot perform:
-- pushing files to Drive, and sending the question memo. Both have their state
-- modelled here so the workflow is complete apart from the final hop.

-- ── language_blocks ──────────────────────────────────────────────────────────
-- The approved-language library (module 8). Built from Caravann's past
-- proposals and SOWs. The SOW is specific that proven winners outrank
-- boilerplate, so `won` and `weight` exist to express that ordering rather
-- than treating every block as equal.
create table if not exists language_blocks (
  id            uuid primary key default gen_random_uuid(),
  section_type  text not null,
  title         text not null,
  body          text not null,
  source        text,                              -- which proposal/SOW it came from
  won           boolean not null default false,    -- came from a proposal that won
  is_boilerplate boolean not null default false,   -- inserted verbatim, never rewritten
  weight        integer not null default 0,        -- manual tie-breaker, higher wins
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column language_blocks.is_boilerplate is
  'Locked text (company description, EEO statement, insurance language). '
  'Assembly copies these verbatim — the model must never paraphrase them.';
comment on column language_blocks.won is
  'From a winning proposal. Ranked above unwon material and above the base '
  'template, per the SOW: proven winners outrank boilerplate.';

create index if not exists language_blocks_section_idx on language_blocks (section_type);

-- ── rfp_proposal_sections ────────────────────────────────────────────────────
-- The assembled draft, one row per required section of a given solicitation.
-- Kept per-section rather than as one blob so a human can accept one section
-- and rewrite another without losing the rest, and so provenance survives.
create table if not exists rfp_proposal_sections (
  id             uuid primary key default gen_random_uuid(),
  rfp_id         uuid not null references rfps (id) on delete cascade,
  section_type   text not null,
  heading        text not null,
  body           text,
  sort_order     integer not null default 0,
  status         text not null default 'draft'
                   check (status in ('draft', 'needs_input', 'approved')),
  -- Which library blocks fed this section. Makes a draft auditable: you can
  -- see whether a paragraph came from a win or from boilerplate.
  source_block_ids uuid[] not null default '{}',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (rfp_id, section_type)
);

comment on column rfp_proposal_sections.status is
  'needs_input = assembly had no library material for this section and it '
  'must be written by hand. Surfaced rather than filled with invented text.';

create index if not exists rfp_proposal_sections_rfp_idx on rfp_proposal_sections (rfp_id);

-- ── filing state on rfps ─────────────────────────────────────────────────────
-- Module 10. drive_folder_url already existed but nothing set it; these track
-- whether filing has actually happened, so a failure is visible instead of
-- looking like it was never attempted.
alter table rfps add column if not exists filing_status text not null default 'not_filed'
  check (filing_status in ('not_filed', 'pending', 'filed', 'failed'));
alter table rfps add column if not exists filing_error text;
alter table rfps add column if not exists filed_at timestamptz;

comment on column rfps.filing_status is
  'Drive filing (module 10). pending = queued for the Drive step, which is '
  'not wired until Google OAuth is connected. The naming convention is '
  '[Engagement]_[Client]_Caravann Consulting.';

-- ── question memo delivery ───────────────────────────────────────────────────
-- Module 7 stored drafts but had nowhere to record approval or an outbound
-- send. Nothing sends automatically: the SOW requires a human on every
-- outbound, and the records-request lane especially.
alter table rfp_questions add column if not exists approved_at timestamptz;
alter table rfp_questions add column if not exists approved_by text;

-- ── team match reasoning ─────────────────────────────────────────────────────
-- Module 9 recommended nothing because there was nowhere to put the reason.
alter table rfp_team_assignments add column if not exists match_reason text;
alter table rfp_team_assignments add column if not exists match_score numeric;

-- ── triggers ─────────────────────────────────────────────────────────────────
drop trigger if exists language_blocks_set_updated_at on language_blocks;
create trigger language_blocks_set_updated_at
  before update on language_blocks
  for each row execute function set_updated_at();

drop trigger if exists rfp_proposal_sections_set_updated_at on rfp_proposal_sections;
create trigger rfp_proposal_sections_set_updated_at
  before update on rfp_proposal_sections
  for each row execute function set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Same allowlist gate as every other table (20260807010000). New tables
-- default to no access until a policy exists, so this is required, not
-- optional.
alter table language_blocks enable row level security;
alter table rfp_proposal_sections enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['language_blocks', 'rfp_proposal_sections']
  loop
    execute format('drop policy if exists "Allowlisted read/write" on %I', t);
    execute format(
      'create policy "Allowlisted read/write" on %I for all '
      'using (public.is_app_user()) with check (public.is_app_user())',
      t
    );
  end loop;
end $$;
