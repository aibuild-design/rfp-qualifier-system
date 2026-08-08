# Next steps

Where the build stands, and the order to finish it in.

**Dashboard:** https://rfp-qualifier-system.vercel.app
**Login:** `khaled@caravann.co` — password handed over separately. **Change it on
first sign-in** (Supabase → Authentication → Users, or the reset-password link
on the login page).

This is now the only account. The build account has been deleted, and the
allowlist has exactly one entry, so nothing else can read the pipeline even
with a valid Supabase login. Add people with `npm run access add`.

Six example solicitations are loaded so there is something to look at. They are
marked **Demo** and covered by a warning banner — they are invented. Clear them
whenever you like:

```bash
npm run seed:demo -- --purge     # remove
npm run seed:demo                # put them back
```

---

## What works today

An RFP posted to the webhook comes back ~40 seconds later as a full verdict card
— go/no-go, score, budget read from the document, gap list, compliance checklist
with deadline countdowns, disqualifier checks, and drafted questions. Verified
end to end against the live stack.

```
solicitation → n8n → Claude → Vercel app → Supabase → dashboard
```

---

## 1. Connect Gmail (5 minutes, needs you)

This is what turns it from "paste a solicitation in" into "it just runs".

The trigger is built and deployed, sitting disabled. It cannot be enabled from
code because Gmail OAuth needs a browser consent screen.

1. Open the workflow: https://caravannaibuild.app.n8n.cloud → **RFP Bid Desk — Intake & Triage**
2. Click the **Gmail — new solicitation** node
3. **Credential → Create new** → sign in with the mailbox that receives solicitations
4. Right-click both greyed-out nodes (**Gmail — new solicitation**, **Email → intake payload**) → **Enable**
5. **Save**

It then polls every minute. Not daily — the SOW promises a solicitation posted at
9pm is scored before Khaled opens his laptop, and a daily pass cannot honour
that. Polling only costs a Gmail API call; the model runs only when an email
actually matches.

The default search is deliberately broad:

```
subject:(RFP OR RFQ OR solicitation OR "request for proposal" OR "request for qualifications")
```

Better to triage a few irrelevant emails than to miss a solicitation. Once you
know the aggregator's sender address, narrow it — set `GMAIL_SEARCH_QUERY` in
`.env.local` and run `npm run n8n:deploy`:

```
GMAIL_SEARCH_QUERY=from:alerts@youraggregator.com
```

**How it decides what to read.** A linked PDF is preferred, then a portal link,
then the email text itself. That order matters: aggregator summaries paraphrase,
and their dollar figures are often well off the real not-to-exceed amount. When
only the summary is available the prompt says so explicitly and asks for a
cautious verdict.

---

## 2. Replace the placeholder profile (the important one)

Everything above is plumbing. **This is what makes verdicts trustworthy.**

Settings → the sector map and eligibility profile currently hold invented
figures, marked as placeholders in each row's notes.

This is not a formality. The same SamTrans solicitation scores:

| Profile | Verdict |
|---|---|
| Populated | **go, 92** |
| Empty | **no-go, 10** |

Three mandatory minimums — "5+ years facilitating for public agencies", "3
comparable transit engagements" — fail on an empty record. The engine is right to
say so, and it will kill winnable bids until the real numbers are in.

What's needed from Khaled:

- **Years and engagement count per sector** — K-12, behavioral health, transit,
  public agencies, higher ed, healthcare, nonprofit, and anything else.
- **Capability flags** — bilingual staff, media production, PR. These matter
  more than they look: a live test no-go'd an Omaha K-12 RFP purely because it
  required Spanish-language facilitation and `bilingual_staff` was false.
- **Office and consultant locations** — drives every local-presence requirement.
- **Certifications and set-aside status** — left empty on purpose. Asserting a
  DBE/SBE status the firm does not hold can void a bid, so these must come from
  actual certificates, never an assumption.

Then confirm **which disqualifiers are hard knockouts**. The engine currently
treats "preferred" as a scoring penalty and "required" as a gate. The SOW says
behavioral health is a genuine dealbreaker for Caravann — tell me which others
are, and they get wired as absolute.

---

## 3. Rotate the keys before handover

The n8n API token, the OpenRouter key, and all Supabase keys were pasted into a
chat session. Nothing reached git — every diff was scanned — but treat them as
exposed:

- Supabase → Settings → API, and Database for the password
- n8n → Settings → n8n API
- OpenRouter → openrouter.ai/keys

---

## Still to build (Phase 1 remainder)

| | |
|---|---|
| Google Drive filing | Verdict folders, per-RFP subfolders, `[Engagement]_[Client]_Caravann Consulting` renaming |
| Proposal assembly | Approved-language library from past wins, drafting into the Word template |
| Team match | Roster exists and the schema is wired; the recommendation step isn't built |
| Weekly digest | Edge cases and overridden verdicts, batched for one review pass |
| Slack/email delivery | Verdict cards currently land in the dashboard only |

Proposal assembly needs the Word template and 2–3 winning proposals — you
mentioned sending those. Drive filing needs folder access.

---

## Commands

```bash
npm run dev                   # local dashboard
npm run migrate               # apply pending migrations
npm run migrate:status        # what's applied
npm run seed:demo             # load example data
npm run seed:demo -- --purge  # remove it
npm run triage:test           # run fixtures through the model, no n8n
npm run e2e                   # full stack test
npm run n8n:validate          # check the workflow graph
npm run n8n:deploy            # push workflow changes
node n8n/deploy.mjs --activate
```
