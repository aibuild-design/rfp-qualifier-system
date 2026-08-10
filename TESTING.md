# Testing the bid desk

Two versions of the same thing. **Part A** is the session to run with Khaled — no terminal,
nothing to install, about 25 minutes. **Part B** is what you run yourself, before and after.

Dashboard: <https://rfp-qualifier-system.vercel.app>

---

# Part A · The session with Khaled

Run this on a screen-share with him driving where possible. The order matters: the profile
comes first, because everything after it is only as good as what it reads from.

## Before you start

Have ready:

- His sign-in (email + password — you have it)
- **One real solicitation** he has already decided on, and his decision kept to yourself until
  step 6. That comparison is the whole point of the session.
- His insurance certificate, or the limits from memory

---

## 1 · Sign in

Go to the dashboard and sign in.

**You should see** the RFP queue, six example solicitations, and two orange banners at the top.

**What it proves** — access works, and the desk is honest about not being ready yet. Those two
banners are the system saying *don't trust me*: one because the rows are examples, one because
nobody has confirmed the profile.

---

## 2 · Fill the two gaps

**Settings → 1 · About Caravann → Eligibility profile.**

Scroll to the two boxes near the bottom:

| Field | What to put |
|---|---|
| **Insurance carried** | Types and limits in his own words — e.g. *"General liability $2M per occurrence / $4M aggregate; professional liability $1M; auto and workers' comp per California statute"* |
| **Facilitating elected or appointed bodies** | e.g. *"Board retreats and strategic planning committees for transit boards, water district boards and university governance since 2014"* |

**Why these two specifically** — across every test run, these are the *only* two mandatory
requirements the desk could not answer. It kept marking them "unconfirmed" and holding good bids
at **maybe** rather than guessing. They're the highest-value ten minutes on this page.

Then check the rest of the section: locations, capabilities, certifications, the sector map, the
roster.

> **Certifications:** leave empty unless he has the certificate in front of him. Claiming a
> DBE/SBE status a firm doesn't hold can void a bid.

---

## 3 · Confirm the profile

Bottom of section 1. There's a checklist — it should now be all ticks.

Tick **"Profile confirmed — all of the above is real"**.

**You should see** the orange banner on the queue disappear.

**What it proves** — the desk stops labelling its own verdicts *provisional*. Until this moment
it was refusing to sound confident, on purpose. Note the existing six rows *stay* marked
provisional: they were scored against placeholder data and confirming afterwards doesn't make
them correct.

---

## 4 · Add a real solicitation

**Add a solicitation.** Two ways in — a link, or paste the text. Paste is more reliable for a
first test.

Fill in the title, the agency, and the full document text. Submit.

**You should see** *"In the queue"* and an **Open it** button.

---

## 5 · Watch the verdict arrive

Click **Open it**, then refresh after about a minute.

**You should see** the verdict fill in: **Go / Maybe / No-go**, a percentage, the budget, both
deadlines.

**What it proves** — the document was fetched, read three separate times by the model, the three
reads reconciled, and the result written back. About 30–60 seconds and roughly 30 cents.

---

## 6 · The moment that matters

**Ask him what he decided on this one.** Compare.

If they match, that's one data point — not proof, but the right direction. If they differ, that
is the single most valuable thing to come out of the session: ask him *why*, and which part of
the reasoning on screen is wrong. That answer is a settings change, not a code change.

---

## 7 · Read the card together

Scroll the whole page and check each block against his judgement:

| Section | The question to ask him |
|---|---|
| **How the score was reached** | Five dimensions, each with a level and a reason. "Is 'strong sector depth' right here?" |
| **Disqualifier checks** | Pass / fail / **unconfirmed**. Anything unconfirmed is a question for the profile. |
| **Compliance checklist** | Page limits, fonts, submission method, insurance. "Did we miss any?" — **this is the recall test, and it is the one worth being fussy about.** A missed page limit loses a bid on a technicality. |
| **Gap list** | What a partner firm would need to bring |
| **Drafted questions** | Would he actually send these to the agency? |
| **Proposal draft** | Assembled from his own language library |

If the score reads high or low to him, note which *dimension* he disagrees with. That maps
directly onto a weight in settings.

---

## 8 · Show him the dials

**Settings → 2 · How the desk decides.**

Change **"Go at or above"** from 85 to 75. Go back to the queue.

**You should see** solicitations that said *Maybe* now say *Go*.

**What it proves** — the verdict is arithmetic he controls, not an opinion the model formed.
Put it back to 85 afterwards, or leave it where he wants it.

**The question to ask him here:** *which is worse — chasing a bid you couldn't win, or passing on
one you could?* Every number on this page is an answer to that, and it's currently set on our
assumption, not his.

---

## 9 · The email path (optional, the real end-to-end)

Have him forward a genuine solicitation email to the connected Gmail account, with **RFP**,
**RFQ**, **solicitation**, **request for proposal** or **request for qualifications** in the
subject line.

Wait 2–3 minutes and refresh the queue.

**You should see** it appear on its own, with a verdict, with nobody having touched the
dashboard.

**Known limits, worth saying out loud rather than letting him discover:**

- An RFP **attached** as a PDF is not read yet — only links in the body
- A **digest** email listing twelve notices produces **one** row, not twelve

---

## 10 · Export

**Export CSV** on the queue. Opens in Excel or Sheets.

---

## Wrapping up — the two things to leave with

1. **Roughly 20 solicitations he has already decided on, with his decision.** Nothing else lets
   anyone say the verdicts are *right* rather than merely consistent.
2. **His answer to the question in step 8.**

---

# Part B · Your checks

From `rfp-qualify/`.

## The one command

```bash
npm run verify
```

**96 checks, about 90 seconds, roughly $0.09** — it puts a real solicitation through n8n and the
model. Cleans up after itself: test rows are prefixed `verify-` and deleted, and any setting it
changes is restored.

```bash
npm run verify -- --fast     # skip the model call — no spend
npm run verify -- --no-ui    # skip the browser checks
```

First time only: `npx playwright install chromium`.

What it covers, in order: configuration, access control, route auth, the SSRF guard, document
extraction (PDF/Word/HTML), verdict logic, intake integrity, settings driving the verdict, a live
triage through n8n, the downstream modules, exports, the dashboard in a real browser at desktop
and iPhone sizes, and cleanup.

**Anything it cannot check, it says it cannot check** rather than passing quietly.

## Checking the pipeline directly

```bash
# is the workflow live and are executions clean?
npm run n8n:validate

# schema up to date?
npm run migrate:status
```

For n8n itself, open <https://caravannaibuild.app.n8n.cloud> → Executions. **Every run should be
green.** They were all red until recently — the triage worked but the Drive branch died on
solicitations with no attached file, which meant a genuine failure would have been invisible in a
list where everything was already red.

## Before the session with Khaled

```bash
npm run verify -- --fast     # ~40s, no spend, proves the stack is up
```

## After the session

```bash
npm run seed:demo -- --purge   # remove the six example rows once his real ones are in
```

Only once he's happy — the examples are the only thing to look at until then.

## If something looks wrong

| Symptom | Where to look |
|---|---|
| Verdict never arrives | n8n → Executions. The failing node names itself. |
| Verdict arrives with no score | The model returned no rubric — check the `OpenRouter — triage` node output |
| Everything says "unconfirmed" | Profile is thin — that's the desk being honest, not a bug |
| Row appears but no compliance items | Check the intake response; a rejected child row returns 500, not a false OK |
| Drive folders in the wrong place | Set `DRIVE_ROOT_FOLDER_ID` and redeploy — unset means they land at the Drive root |

---

## What this does not prove

Worth being straight about, because the checks are green and that can read as "finished":

- **The verdicts are consistent. Nobody has shown they are correct.** That needs step 6, twenty
  times over.
- **The variance measurements are one synthetic document.** The mechanism is demonstrated; it is
  not a general accuracy claim.
- **Recall is the weak axis on every frontier model** — published benchmarks put it at 49–71%
  against 92–96% precision. It misses requirements rather than inventing them, which is why step
  7's compliance checklist deserves the most attention in the session.
