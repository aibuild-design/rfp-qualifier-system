# Does it work?

Short answer: **yes, the whole flow runs end to end** — **91 of 91 automated checks pass with
nothing skipped**, including a real solicitation going through n8n and the model, and the whole
dashboard driven in a real browser at desktop and phone sizes. The verdict instability that made
it untrustworthy is fixed and measured.

What is left is not code. The system now says clearly what it does not know about Caravann,
and answering those questions is Khaled's part — see
[What is needed to finish this](#what-is-needed-to-finish-this).

Last full run: 2026-08-09, against https://rfp-qualifier-system.vercel.app

---

## Run it yourself

```bash
npm run verify                 # everything, including one real triage (~$0.09)
npm run verify -- --fast       # skip the model call, no spend
npm run verify -- --no-ui      # skip the browser checks
```

Browser checks need a login. `VERIFY_LOGIN_EMAIL` and `VERIFY_LOGIN_PASSWORD` are in
`.env.local` (gitignored) and are picked up automatically — the same single account Khaled uses,
because there is only one.

First time only: `npx playwright install chromium`.

The script creates rows prefixed `verify-` and deletes them at the end. It never touches the
demo rows or the eligibility profile, and it restores any setting it changes.

---

## What the last run proved

**91 of 91 passed, nothing skipped.** Grouped by what each section actually establishes:

| # | Section | What it proves | Result |
|---|---|---|---|
| 1 | Configuration | Every credential the system needs is present | 5/5 |
| 2 | Access control | One account, one allowlist entry; an anonymous visitor with the public key reads nothing from 7 tables and cannot write | 4/4 |
| 3 | Route authentication | All four API routes refuse anonymous callers and wrong keys; `/dashboard` redirects when signed out | 6/6 |
| 4 | SSRF guard | Cloud metadata, loopback, private LAN, the obfuscated `2130706433` spelling of 127.0.0.1, and credentials-in-URL are all refused | 5/5 |
| 5 | Document extraction | PDF, **Word**, and HTML all read; a dead link is reported rather than guessed at | 5/5 |
| 6 | Verdict logic | A failed mandatory requirement beats a 99% score; 100 identical inputs give exactly one answer; an *unanswered* mandatory requirement holds at maybe and names itself, while a genuine miss still closes the bid | 11/11 |
| 7 | Intake integrity | The model's label is discarded and recomputed; child rows persist; an unparseable date is nulled rather than invented; a genuinely broken row returns 500 rather than a false OK; re-posting updates in place | 8/8 |
| 8 | Settings drive the verdict | At go=85 a score of 80 is a maybe; lower the bar to 75 and the same 80 becomes a go | 3/3 |
| 9 | **Live triage** | A solicitation goes into n8n and a verdict comes back in ~40s, with the budget read from the document, both deadlines, 4 gate checks, 9 compliance items and 3 drafted questions | 9/9 |
| 10 | Downstream modules | Proposal assembly, team match, portal rules, filing status | 6/6 |
| 11 | Exports | CSV neutralises formula injection; the Word export is a real Office file | 3/3 |
| 12 | The dashboard | All 6 pages plus an RFP detail page render signed-in with no runtime errors; nothing scrolls sideways on an iPhone; every input ≥16px and every touch target ≥44px; motion tokens defined, a press visibly responds and returns, motion never animates layout, and `prefers-reduced-motion` removes all movement | 24/24 |
| 13 | Cleanup | Test rows removed, only the 6 demo rows remain | 2/2 |

Findings from writing the tests, worth recording because reading the code would not have
surfaced any of them:

- A mobile run failed sign-in on a rate limit, which put the **login screen** under the
  touch-target check and caught a 40px sign-in button and a 16px "Forgot password?" link — on
  the one screen every user has to get through.
- A click failed because the queue now renders twice (cards below `md`, table above), so the
  first matching link was the hidden one. The app was right; the test was naive.
- The first time the dashboard was driven **signed in**, screenshots showed three things every
  assertion had passed straight over: the "Pending triage" pill wrapped mid-label and stretched
  its row, the demo banner ran to nine lines on a phone and pushed the whole queue below the
  fold, and the stat cards stacked one per row — four cards to scroll before a single
  solicitation. Tests confirm what you thought to check; looking at it catches the rest.
- A motion run reported a button with the wrong brand tokens entirely. A different project's dev
  server already held port 3000, so `npm start` had died on `EADDRINUSE` and the checks had been
  driving someone else's app. Worth the reminder that a green-looking result proves nothing until
  you confirm what it was pointed at.

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
- **The gate** — a required failure only closes the bid when the reads agree. A lone dissenting
  read does not get to kill a winnable bid. (This started as a majority vote and was later
  tightened to unanimity — see [the gate section](#the-gate-silence-was-being-read-as-failure).)
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

### Then the number stopped being a guess at all

Medians treat the symptom. The cause was that the prompt asked for "capability overlap, 0-100"
— an open-ended number with nothing to anchor it. Ask a human expert that on three different
days and you get the same spread.

So the model no longer produces the number. It answers five questions with defined levels —
*is Caravann's depth in this sector none, thin, adequate or strong?* — and the arithmetic
happens in [`lib/rubric.ts`](lib/rubric.ts). Same move that already fixed the label: keep the
judgement the model is good at (classifying against a described standard) and take away the one
it is bad at (inventing a scale).

Four runs of the same document:

```
86%  [strong / many / remote_ok / comfortable / adequate]
86%  [strong / many / remote_ok / comfortable / adequate]
86%  [strong / many / remote_ok / comfortable / adequate]
76%  [adequate / many / remote_ok / comfortable / adequate]
```

Three reads byte-identical, the fourth differing on one dimension. The prompt text and the
scoring levels are generated from the same definition, so the two cannot drift apart — there is
a test that fails if they do. A side benefit: **every score now explains itself line by line**
on the RFP page, and the weights became a setting Khaled can change rather than something baked
into a prompt.

---

## The gate: silence was being read as failure

The rubric worked, and in doing so it uncovered the thing actually causing the bad verdicts.
Run 2 above came back `NO_GO` at 86% — above the go bar, with classifications identical to two
runs that said `GO`. A gate check had fired. Three more runs, and all three failed the *same*
requirement:

```
Experience facilitating elected or appointed governing bodies    ->  FAIL  ->  NO_GO
```

Caravann has facilitated public-agency boards for twelve years across thirty-four engagements.
The verdict was wrong, consistently, and for a reason worth stating plainly.

The gate offered three answers — `pass`, `fail`, `not_applicable` — and the prompt correctly
says never to assume a capability the profile does not record. **Between those two rules, a
requirement the profile is simply silent on had exactly one available answer: `fail`.** And a
required fail closes the bid.

So the desk was reporting gaps in *our own data* as deficiencies in *the firm*. Two very
different things with very different costs:

| | | |
|---|---|---|
| The profile shows Caravann does **not** meet it | a real disqualifier | close the bid |
| The profile **does not say** | a gap in what we recorded | ask the question |

**The fix.** A fourth result, `unclear`. It never closes a bid; it caps the verdict at `maybe`
and names the requirement to confirm. Reconciliation changed with it: a majority vote picks a
side on a 2-1 split, which is exactly the case where there is no side to pick — the
disagreement *is* the uncertainty. Now **every read must independently agree** a required
requirement fails before the bid closes.

Deliberately asymmetric, because the errors are not symmetric. A wrongly closed bid is a
$45K–$185K pursuit lost in the folder nobody reopens. A wrongly raised question costs five
minutes of reading.

**Measured, four runs of the document that used to fail:**

```
before:  NO_GO,  NO_GO,  NO_GO,  NO_GO         all on a requirement Caravann meets
after :  MAYBE,  MAYBE,  MAYBE,  MAYBE         same two questions raised every time

    ? Experience facilitating elected or appointed governing bodies
    ? General liability insurance of $2,000,000
```

Both are genuinely absent from the profile, so `maybe` is the honest answer. And the loop
closes — adding two sentences to the profile and re-running:

```
GO @ 86%   4 of 4 mandatory requirements pass, 0 unconfirmed
GO @ 86%   4 of 4 mandatory requirements pass, 0 unconfirmed
```

**That is the whole design in one line: every unconfirmed item is a question Khaled answers
once, in Settings, and never sees again.** The desk gets better as he uses it, and it tells him
precisely what to feed it rather than failing quietly.

One smaller fix fell out of the same runs: the three reads phrased the insurance requirement two
ways, so it appeared on the card twice — one obligation reading as two open questions. Near-
duplicate requirements are now folded together, using a subset test rather than fuzzy matching so
that `$2,000,000 insurance` merges into `$2,000,000 insurance required` while `30 pages` and
`50 pages` stay separate. Six cases covered by a test, including the ones that must *not* merge.

---

## Two corrections worth recording

Both were caught by running the thing, not by reading it, and both were wrong in the same
direction — a rule that looked reasonable written down and would have quietly killed good bids.

**The spread cap.** The first cut capped the verdict at `maybe` whenever total spread exceeded a
tolerance. Then a real run returned **58, 87, 88** — spread 30, but two reads agree to within a
point and the median is well supported. That rule would have demoted a clear `go` every time the
model had an off run, which is often. The test is now the **smallest gap between neighbouring
reads**, so it fires only when no two reads agree on anything: `58, 87, 88` is a confident go,
`30, 60, 90` is a genuine "read this yourself". Tolerance is configurable in Settings.

**The gate nudge.** Introducing `unclear` overshot on the first attempt — the prompt told the
model to prefer it when unsure, and it began marking requirements the profile *does* answer as
unconfirmed. "Five years with public agencies" against a sector map reading 12 years and 34
engagements should be a pass, not a question. That failure is quieter than a false `no_go` but
it has the same end state: if everything is flagged, nothing is. The prompt now says explicitly
that `unclear` is for silence, not for imperfect wording.

### What this costs

Three reads instead of one, with reasoning on: roughly **$0.30 per solicitation** rather than
$0.09, and 25–55 seconds rather than ~40. Against $855 of principal time per solicitation, that
is the easiest trade on the board.

---

## The interface

Every interactive surface had `transition-colors` and nothing else — no response to a press,
which on a phone is the only feedback there is, since there is no hover to fall back on.

Motion is now a **token system** in [`app/globals.css`](app/globals.css) rather than a decision
re-made per component. That matters more than it sounds: what makes an interface feel built
rather than assembled is that everything moves the same way. A 300ms button beside a 120ms row
reads as two products.

Three rules the tokens encode:

- **Only `transform` and `opacity` animate.** Anything touching width, height, top or left goes
  through layout on every frame and drops below 60fps on the device this is actually used on.
- **Exits run ~65% of entrance duration.** Waiting for something to leave is what feels sluggish;
  arriving slowly reads as considered.
- **Press feedback is 90ms.** Under 100ms the interface feels like it is responding to your
  finger. Over ~150ms it feels like it is deciding.

Press ratios scale with the surface — 0.97 on a button, 0.994 on a card, 0.998 on a table row.
Equal *pixel* travel is what reads as one system; equal percentage does not. Hover effects sit
behind `@media (hover: hover)`, which fixes a real bug: a tap used to leave a row stuck looking
selected until you tapped elsewhere.

**The stat cards now filter the queue.** They were dead numbers. A number that names a subset
should get you to that subset — "3 pending triage" is a question, and the click is the answer.
The active card is marked, so the page always says which subset is on screen.

`prefers-reduced-motion` removes movement entirely. Colour transitions stay: those carry state
rather than motion, and dropping them makes the interface feel broken rather than calm.

Five motion assertions run in the always-on tier of `npm run verify`, deliberately placed ahead
of the credential gate — they only need the login page, and motion is exactly the kind of thing
that rots silently when someone swaps a class.

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
| Recall sweep (second pass for missed requirements) | Partly addressed — the three-read union is a recall sweep in effect. A dedicated pass is still worth measuring |
| Model benchmark | Needs Khaled's decided RFPs to be worth running |
| Slack / email delivery of the verdict card | Cards live in the dashboard only |
| Email digest splitting | One email is currently treated as one solicitation; an aggregator digest listing twelve produces one row |
| Attachments in email intake | Only links in the body are scanned today |

---

## What is needed to finish this

The engineering is done and measured. What remains is almost entirely **inputs**, and the system
now tells us precisely which ones: every `unconfirmed` line on a verdict card is a question it
could not answer about Caravann.

### From Khaled

Ranked by what unblocks the most.

**1 — The eligibility profile. This is the one that matters.**
Everything on the profile screen today is placeholder text; it says so in its own notes field.
Every verdict produced so far is therefore a *demonstration of the mechanism*, not a real
recommendation. Specifically:

- Office and consultant locations, bilingual / media / PR capability
- **Certifications actually held** — deliberately left empty, because claiming a DBE/SBE status a
  firm does not hold can void a bid. These only ever get filled in from real certificates.
- Insurance carried, with limits — this came up as an unconfirmed item on live runs
- Whether Caravann facilitates elected and appointed bodies — same
- Confirmation of the sector map's numbers (it is pre-filled with plausible figures to confirm or
  correct, not a blank form)

An hour on this screen is worth more than anything else on the list.

**2 — About 20 solicitations he has already decided on, with the decision.**
His call is the answer key. Until we have it, nobody can say the verdicts are *right* — only
that they are consistent, which is what has been proved so far. This is also the only thing that
makes a model comparison meaningful.

**3 — Past proposals: 8–10 across wins and losses**, plus the blank Word template, 2–3 complete
winning proposals, and the insurance certificate. These fill the language library and let the
proposal draft use Caravann's own words.

**4 — 10–20 real solicitation emails, forwarded as they arrive.** Ideally including one digest
listing several notices, one single notice, and one where the RFP is attached rather than
linked — those are three different intake shapes and only the middle one is handled today.

**5 — Two judgement calls only he can make:**
- Which disqualifiers are absolute, versus worth a conversation
- **Which error hurts more: chasing a bid he could not win, or passing on one he could.** Every
  threshold on the settings screen is a different answer to that question. It is currently tuned
  on the assumption that missing a winnable bid is worse — that assumption should be his, not
  mine.

### From you

**1 — Get the profile filled, in a call rather than by email.** Item 1 above is a 45-minute
screen-share, and it will not happen by sending a link. Most of it is confirm-or-correct.

**2 — Decide the delivery surface.** Verdicts live in the dashboard only. If Khaled will not
open a dashboard daily, the verdict card needs to go to Slack or email — that is a real build,
and it is a product decision, not a technical one. Worth asking him directly rather than
assuming.

**3 — Two credentials, if we want the remaining automation live:**
- Gmail — connected, but the trigger is not switched on. The workflow deploys with
  `n8n:deploy --activate` when you want it accepting real mail.
- Google Drive — connected; the folder structure is designed but not built.

**4 — Confirm the login decision in writing.** You asked me to remove authentication and use a
single email. I narrowed access to one allowlisted account instead of removing the login screen,
because this holds a live competitive bid pipeline and an unauthenticated public URL would expose
Caravann's pursuit list, scoring and gap analysis to anyone with the link — including the firms
they bid against. If you did mean *one user, no allowlist administration*, that is what is built.
If you meant *no login screen at all*, I want that from you explicitly before doing it.

**5 — Nothing on cost.** Three reads with reasoning is roughly $0.30 a solicitation against $855
of Khaled's time. That question is settled; it does not need revisiting.

### What is genuinely still unknown

Worth being straight about the limits of what has been proved:

- **The verdicts are consistent; nobody has shown they are correct.** That needs item 2 above.
- **All variance measurement is one synthetic document.** The mechanism is demonstrated; the
  numbers are not a general accuracy claim.
- **Recall is the weak axis on every frontier model** (published benchmarks put it at 49–71%
  against 92–96% precision). It misses requirements rather than inventing them. The three-read
  union helps — compliance items went from 5–6 on single reads to 8–9 on the union — but that is
  a suggestive sample, not a proven improvement.
