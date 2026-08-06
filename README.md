# RFP Qualifier

Dashboard for qualifying and tracking incoming RFPs. Next.js 16 (App Router) + Tailwind v4, Supabase for auth/data.

Theme is pulled from [caravann.co](https://www.caravann.co/) — near-black ink on white, single gold accent, minimal/generous-whitespace, card-based sections. Dashboard/auth architecture mirrors the sibling `signal-based-scrapper` (Goldhill Group) build: same split-screen login, Supabase-not-configured gate, and migrations-first pattern — different brand and domain.

## Status

This is the skeletal build: login, password reset, and the dashboard shell (sidebar/topbar/stat cards) are wired, but no Supabase project is attached yet and no RFP-specific schema exists. The dashboard shows a "not connected" gate until that's set up.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key
npm run dev
```

Then, once a Supabase project exists, run the migration in `supabase/migrations/` against it (via the Supabase SQL editor or CLI) to create the `profiles` table and auth trigger.

## What's next

The RFP-specific schema (RFPs, qualification criteria, scoring, review workflow) and the corresponding dashboard sections aren't scoped yet — add them as follow-up migrations and pages once that's defined.
