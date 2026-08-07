-- Demo-data flag.
--
-- Seeded example solicitations need to be visible enough to evaluate the tool
-- against, and impossible to mistake for real procurement. A naming
-- convention (external_id like 'DEMO-%') would do neither: external_id is
-- nullable, n8n controls it, and nothing in the UI would surface it.
--
-- An explicit column means the dashboard can render an unmissable banner, tag
-- every demo row inline, and purge the whole set in one statement without
-- touching a single real RFP.
--
-- Real intake never sets this. The default is false and the intake route
-- doesn't accept the field, so anything arriving from n8n is real by
-- construction.

alter table rfps add column if not exists is_demo boolean not null default false;

comment on column rfps.is_demo is
  'True only for seeded example data (scripts/seed-demo.mjs). Drives the '
  'dashboard warning banner and the one-command purge. Never set by the '
  'intake route — real solicitations are always false.';

create index if not exists rfps_is_demo_idx on rfps (is_demo) where is_demo;
