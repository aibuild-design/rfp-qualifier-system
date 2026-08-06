# RFP Qualifier — Caravann bid desk

An RFP goes in, a go/no-go verdict comes out, for Khaled's call. Phase 1 of the
Astrid Labs × Caravann engagement.

Next.js 16 (App Router) + Tailwind v4, Supabase for auth/data, n8n + OpenRouter
for intake and triage.

Theme is pulled from [caravann.co](https://www.caravann.co/) — near-black ink on
white, single gold accent, generous whitespace, card-based sections. The
dashboard/auth architecture mirrors the sibling `signal-based-scrapper`
(Goldhill Group) build: same split-screen login, Supabase-not-configured gate,
and migrations-first pattern.

## How it fits together

```
solicitation ──▶ n8n workflow ──▶ OpenRouter (one pass, whole document)
                      │                    │
                      │   GET /api/rfps/context   (eligibility profile + sector map)
                      │                    ↓
                      └──────▶ POST /api/rfps/intake ──▶ Supabase ──▶ dashboard
```

n8n holds no Supabase credential — it only ever talks to this app and
OpenRouter, both behind a shared secret that is deliberately *not* the
service-role key.

## Status

| Piece | State |
| --- | --- |
| Auth (login, reset, session gate) | built |
| RFP queue + detail view | built, reads live data |
| Settings (eligibility profile, sector map, team roster) | built, writes live data |
| Schema | written as migrations, **not yet applied** — no Supabase project attached |
| n8n intake + triage workflow | built and tested against fixtures, **not yet deployed** |
| Proposal assembly, filing, team match, weekly digest | not built |

The triage engine is tested end to end against OpenRouter (3/3 fixtures,
`npm run triage:test`). Everything downstream of Supabase is untested against a
live database, because there isn't one yet.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + keys, OpenRouter key
npm run dev
```

Then, against a real Supabase project, run both migrations in
`supabase/migrations/` in filename order (SQL editor or CLI):

1. `20260806000000_init_profiles.sql` — profiles table + auth trigger
2. `20260806010000_rfp_domain_schema.sql` — the RFP domain (verdicts, gaps,
   compliance, disqualifiers, questions, sector map, roster)

## The dashboard

- **Queue** — every RFP ranked by qualification score, so the closest fit to
  work Caravann has already won sits at the top. Re-sortable by deadline.
  No-go RFPs drop out of the ranked view into their own folder; nothing is
  ever deleted, matching the SOW's "labeled, not hidden" standard.
- **RFP detail** — the verdict card (score, budget, why/why-not), gap list,
  compliance checklist with countdowns (yellow inside 7 days, red inside 3),
  disqualifier checks, and the two-lane question memo.
- **Settings** — the eligibility profile and sector experience map that every
  verdict is judged against, plus the team roster. Edited here, read by the
  triage prompt on the next RFP.

## Automation

See [`n8n/README.md`](n8n/README.md) for the workflow, its two credentials,
deploy commands, and the fixture test suite.

## Not in Phase 1

Teaming engine, RFP sourcing automation, the hours/pricing model, full portal
automation, pulling agency Q&A off portals, the analytics dashboard, and
hands-off proposal writing. All Phase 2 — see the signed SOW.
