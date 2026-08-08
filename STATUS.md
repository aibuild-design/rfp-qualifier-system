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

## The one thing that isn't fixed

The label is now decided in code, so **a given score always produces the same verdict**. That
part is solid and tested 100 ways.

**The score itself is not stable.** Five runs of a byte-identical document, same profile, same
settings:

```
55, 82, 86, 88, 90        spread: 35 points
```

Four of those five are `go` or `maybe`. One is `no_go`. Same document.

So roughly **one solicitation in five would be silently binned** — and the no-go folder is
exactly where nobody looks again. This is not a plumbing failure; every layer did its job. It
is the model returning a materially different read of the same text.

Two credible causes, and they compound: OpenRouter routes across providers (a previous run was
served by Amazon Bedrock and another 500'd mid-generation), and the model is not deterministic
even at temperature 0.

### What I'd do about it

1. **Pin the provider.** Removes the routing variable. Costs nothing.
2. **Score three times and take the median.** The classic fix for exactly this shape of
   problem, and the numbers above show why it works — the outlier is one of five, so the median
   of three lands in the 82–90 cluster nearly every time. Roughly **$0.27 per solicitation**
   instead of $0.09.
3. **Then measure it** against Khaled's real decided RFPs before believing it is fixed.

I have not built any of these yet — flagging the problem is more useful than quietly picking a
remedy for something this load-bearing.

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
