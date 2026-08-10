# RFP Qualifier - Caravann bid desk

An RFP goes in, a go/no-go verdict comes out, for Khaled's call. Phase 1 of the
Astrid Labs × Caravann engagement.

Next.js 16 (App Router) + Tailwind v4, Supabase for auth/data, n8n + OpenRouter
for intake and triage.

Theme is pulled from [caravann.co](https://www.caravann.co/) - near-black ink on
white, single gold accent, generous whitespace, card-based sections. The
dashboard/auth architecture mirrors the sibling `signal-based-scrapper`
(Goldhill Group) build: same split-screen login, Supabase-not-configured gate,
and migrations-first pattern.

## Where to look

| | |
|---|---|
| **[TESTING.md](TESTING.md)** | How to test it - a session to run with Khaled, and the commands to run alone |
| **[STATUS.md](STATUS.md)** | What works, what was fixed and measured, and what is still needed |
| **[SECURITY.md](SECURITY.md)** | Security review findings, how credentials are split, what to rotate at handover |
| **[n8n/README.md](n8n/README.md)** | The intake and triage workflow |

---

## How it fits together

```
solicitation ──▶ n8n workflow ──▶ OpenRouter (one pass, whole document)
                      │                    │
                      │   GET /api/rfps/context   (eligibility profile + sector map)
                      │                    ↓
                      └──────▶ POST /api/rfps/intake ──▶ Supabase ──▶ dashboard
```

n8n holds no Supabase credential - it only ever talks to this app and
OpenRouter, both behind a shared secret that is deliberately *not* the
service-role key.

## Status

| Piece | State |
| --- | --- |
| Auth (login, reset, session gate) | built, live |
| Schema | applied to Supabase - 13 tables, RLS on every one |
| RFP queue + detail view | built, verified against live data |
| Settings (eligibility profile, sector map, team roster) | built, live |
| App | deployed - https://rfp-qualifier-system.vercel.app |
| n8n intake + triage workflow | deployed, activated, verified live end to end |
| Eligibility profile + sector map contents | **empty - Khaled has to fill these in** |
| Proposal assembly, filing, team match, weekly digest | not built |

Verified: 3/3 triage fixtures (`npm run triage:test`) and 27/27 end-to-end
assertions (`npm run e2e`) covering triage → intake → Supabase → the
dashboard's own queries, including upsert idempotency on re-triage.

**Before trusting any verdict**, fill in the eligibility profile and sector
experience map in Settings. They ship empty on purpose - those numbers are
Caravann's to state, not ours to guess.

This is not theoretical. The same SamTrans facilitation solicitation scores
**go / 92** against a populated profile and **no-go / 10** against the empty
one, because three mandatory minimums ("5+ years facilitating for public
agencies", "3 comparable transit engagements") fail on an empty record. The
engine is right to say so - but until the map is filled in, it will kill bids
Caravann would win. The dashboard shows a warning banner until then.

## Getting started

```bash
npm install
cp .env.example .env.local   # Supabase URL + keys, OpenRouter key, DB host/password
npm run migrate              # apply pending migrations (idempotent)
npm run dev
```

`npm run migrate:status` lists applied vs pending without changing anything.

## The dashboard

- **Queue** - every RFP ranked by qualification score, so the closest fit to
  work Caravann has already won sits at the top. Re-sortable by deadline.
  No-go RFPs drop out of the ranked view into their own folder; nothing is
  ever deleted, matching the SOW's "labeled, not hidden" standard.
- **RFP detail** - the verdict card (score, budget, why/why-not), gap list,
  compliance checklist with countdowns (yellow inside 7 days, red inside 3),
  disqualifier checks, and the two-lane question memo.
- **Settings** - the eligibility profile and sector experience map that every
  verdict is judged against, plus the team roster. Edited here, read by the
  triage prompt on the next RFP.

## Automation

See [`n8n/README.md`](n8n/README.md) for the workflow, its two credentials,
deploy commands, and the fixture test suite.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run migrate` / `migrate:status` | apply / list migrations |
| `npm run triage:test` | 3 fixture solicitations through real OpenRouter, asserts verdicts |
| `npm run e2e` | full path against live Supabase; `-- --keep` leaves a demo RFP in the queue |
| `npm run n8n:validate` / `n8n:deploy` | validate / push the workflow |

## Not in Phase 1

Teaming engine, RFP sourcing automation, the hours/pricing model, full portal
automation, pulling agency Q&A off portals, the analytics dashboard, and
hands-off proposal writing. All Phase 2 - see the signed SOW.
