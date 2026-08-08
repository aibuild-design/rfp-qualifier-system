# Does it work?

Short answer: **yes, the whole flow runs end to end** — 82/82 automated checks against the
live deployment. But there is one unresolved problem that decides whether Khaled can trust
it, and it is not a bug in the plumbing. It is at the bottom of this page under
[The one thing that isn't fixed](#the-one-thing-that-isnt-fixed). Read that before deciding
this is finished.

Last full run: 2026-08-09, against https://rfp-qualifier-system.vercel.app

---

## Run it yourself

```bash
npm run verify                 # everything, including one real triage (~$0.09)
npm run verify -- --fast       # skip the model call, no spend
npm run verify -- --no-ui      # skip the browser checks
```

Browser checks need a login:

```bash
VERIFY_LOGIN_EMAIL=khaled@caravann.co VERIFY_LOGIN_PASSWORD=… npm run verify
```

First time only: `npx playwright install chromium`.

The script creates rows prefixed `verify-` and deletes them at the end. It never touches the
demo rows or the eligibility profile, and it restores any setting it changes.

---

## What the last run proved

**82 of 82 passed.** Grouped by what each section actually establishes:

| # | Section | What it proves | Result |
|---|---|---|---|
| 1 | Configuration | Every credential the system needs is present | 5/5 |
| 2 | Access control | One account, one allowlist entry; an anonymous visitor with the public key reads nothing from 7 tables and cannot write | 4/4 |
| 3 | Route authentication | All four API routes refuse anonymous callers and wrong keys; `/dashboard` redirects when signed out | 6/6 |
| 4 | SSRF guard | Cloud metadata, loopback, private LAN, the obfuscated `2130706433` spelling of 127.0.0.1, and credentials-in-URL are all refused | 5/5 |
| 5 | Document extraction | PDF, **Word**, and HTML all read; a dead link is reported rather than guessed at | 5/5 |
| 6 | Verdict logic | A failed mandatory requirement beats a 99% score; 100 identical inputs give exactly one answer | 7/7 |
| 7 | Intake integrity | The model's label is discarded and recomputed; child rows persist; an unparseable date is nulled rather than invented; a genuinely broken row returns 500 rather than a false OK; re-posting updates in place | 8/8 |
| 8 | Settings drive the verdict | At go=85 a score of 80 is a maybe; lower the bar to 75 and the same 80 becomes a go | 3/3 |
| 9 | **Live triage** | A solicitation goes into n8n and a verdict comes back in ~40s, with the budget read from the document, both deadlines, 4 gate checks, 5 compliance items and 3 drafted questions | 9/9 |
| 10 | Downstream modules | Proposal assembly, team match, portal rules, filing status | 6/6 |
| 11 | Exports | CSV neutralises formula injection; the Word export is a real Office file | 3/3 |
| 12 | The dashboard | All 6 pages plus an RFP detail page render signed-in with no runtime errors; nothing scrolls sideways on an iPhone; every input ≥16px and every touch target ≥44px | 19/19 |
| 13 | Cleanup | Test rows removed, only the 6 demo rows remain | 2/2 |

Two findings from writing the tests, worth recording because reading the code would not have
surfaced either:

- A mobile run failed sign-in on a rate limit, which put the **login screen** under the
  touch-target check and caught a 40px sign-in button and a 16px "Forgot password?" link — on
  the one screen every user has to get through.
- A click failed because the queue now renders twice (cards below `md`, table above), so the
  first matching link was the hidden one. The app was right; the test was naive.

---

## The verdict instability — fixed and measured

**Before.** Five runs of a byte-identical document, one read each:

```
55, 82, 86, 88, 90        spread 35 points
verdicts: no_go, maybe, go, go, go
```

Four go-or-maybe, one `no_go`. Roughly **one solicitation in five was being dropped into the
no-go folder** — the one place nobody looks again — with nothing to notice.

**What changed.** Each solicitation is now read **three times** and the results reconciled:

- **Score** — the median, so one bad read cannot move it.
- **Compliance items and gaps** — the union across all three, deduped. Missing a page limit
  loses a bid; a spare checklist line costs nothing, and recall is the weak axis on every
  frontier model.
- **The gate** — a required failure only closes the bid when a **majority** of reads agree. A
  lone dissenting read does not get to kill a winnable bid.
- **Provider pinned** to Anthropic with fallbacks off, so routing stops varying (an earlier run
  was served by Amazon Bedrock and another 500'd mid-generation). Reasoning is on, and a
  transient upstream error costs a retry rather than the solicitation.

**After.** Same document, three runs of the full pipeline:

```
run 1: reads [78, 90, 90] -> median 90% -> GO
run 2: reads [78, 85, 90] -> median 85% -> GO
run 3: reads [85, 85, 86] -> median 85% -> GO

verdict spread: 35 points -> 5 points        all three verdicts identical
```

Individual reads still wobble — that is the model, and it has not gone away. The point is that
the wobble no longer reaches the verdict.

**Every sample is stored**, not just the median, so disagreement stays visible on the card and
we can tell over time whether the model is steadying rather than guessing.

### One correction worth recording

The first cut capped the verdict at `maybe` whenever total spread exceeded a tolerance. Then a
real run returned **58, 87, 88** — spread 30, but two reads agree to within a point and the
median is well supported. That rule would have demoted a clear `go` every time the model had an
off run, which is often.

The test is now the **smallest gap between neighbouring reads**, so it fires only when no two
reads agree on anything: `58, 87, 88` is a confident go, `30, 60, 90` is a genuine "read this
yourself". Tolerance is configurable in Settings.

### What this costs

Three reads instead of one, with reasoning on: roughly **$0.30 per solicitation** rather than
$0.09, and 25–55 seconds rather than ~40. Against $855 of principal time per solicitation, that
is the easiest trade on the board.

### Still worth doing

Measure it against Khaled's real decided RFPs. Three runs of one synthetic document proves the
mechanism works; it does not prove the verdicts are *right*.

---

## Cost

Per solicitation, at roughly 26K input tokens and 4K output:

| Model | Cost / RFP | Note |
|---|---|---|
| Haiku 4.5 | $0.05 | fine for the email gate, untested for verdicts |
| **Sonnet 5 (current)** | **$0.09** | intro pricing — **rises to ~$0.14 after 31 Aug 2026** |
| Gemini 3.1 Pro | ~$0.14 | comparable precision on published benchmarks |
| Opus 5 | $0.23 | |
| ~~GPT-5.5~~ | ~~$0.28~~ | most expensive output tokens of the group; skip |

Set against what it replaces: **three hours of Khaled's time at $285/hr is $855.**

The entire spread between the cheapest and most capable option here is **eighteen cents**. At
20 solicitations a week — about 1,000 a year — choosing Opus over Sonnet costs roughly **$140
a year**, against contracts worth $45K–$185K each.

**So the honest recommendation on cost is: stop optimising it.** Spending three times as much
to make the verdict trustworthy (the median-of-three above, ~$0.27) is obviously correct at
this ratio, and still rounds to nothing. Cheap is already solved; reliable is not.

One thing genuinely worth doing: **Sonnet 5's introductory pricing ends 31 August 2026** and
goes from $2/$10 to $3/$15 per million tokens. Worth knowing, not worth reacting to.

---

## What is not built

| | Why |
|---|---|
| Google Drive folder tree | Credentials connected; the folder structure was designed but not built |
| Recall sweep (second pass for missed requirements) | Published benchmarks show every frontier model is precise but under-recalls — it misses requirements rather than inventing them |
| Model benchmark | Needs Khaled's decided RFPs to be worth running |
| Slack / email delivery of the verdict card | Cards live in the dashboard only |
| Email digest splitting | One email is currently treated as one solicitation; an aggregator digest listing twelve produces one row |
| Attachments in email intake | Only links in the body are scanned today |

---

## What is needed from Khaled

Nothing technical is blocked on anything but this.

1. **Past proposals — 8–10, wins and losses.** Plus the blank Word template, 2–3 complete
   winning proposals, and the insurance certificate. These fill the language library *and*
   pre-fill the sector map, so he confirms numbers rather than writing them.
2. **About 20 solicitations he has already decided on.** His decision is the answer key. Without
   it, no model comparison and no accuracy claim means anything.
3. **10–20 real solicitation emails, forwarded.** Including a digest, a single notice, and one
   where the RFP is attached rather than linked.
4. **A few answers:** bilingual/media/PR capability, office and consultant locations,
   certifications actually held, which disqualifiers are absolute, whether behavioural health is
   a true zero — and which is worse for him, chasing a bid he could not win or passing on one he
   could.

Until the profile is his, every verdict is a demonstration. The plumbing is real; the numbers
it reasons from are not yet.
