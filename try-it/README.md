# Try it — a worked example

Nothing to set up. The desk is live and the queue is empty. Pick one of the two
routes below; both end in the same place.

**Dashboard:** https://rfp-qualifier-system.vercel.app
**Login:** `khaled@caravann.co` (password is `VERIFY_LOGIN_PASSWORD` in `.env.local`)
**Watched mailbox:** `aibuild@caravann.co`

Everything you need is in this folder:

| File | What it is |
|---|---|
| `sample-solicitation.docx` | the RFP to attach |
| `email-subject.txt` | the subject line, to copy |
| `email-body.txt` | the message body, to copy |

The solicitation is a Fictional agency, marked as a sample on its first line, but
shaped like a real RFP — four minimum qualifications, a 25-page limit, portal-only
submission, three references, $2M insurance, two different deadlines and a named
contact. Verified: the extractor reads all seven of those out of it.

---

## Route A — by email (the real path, ~2 minutes)

Send a message to **aibuild@caravann.co**.

**Subject** — copy this exactly:

```
RFP No. RVA-2026-14 — Organizational Development and Strategic Planning Services
```

**Attach** `sample-solicitation.docx`.

**Body** — anything. This works:

```
Sharing the attached RFP from Riverbend Valley Authority for review.
Proposals are due 9 October. Questions close 25 September.

Marcus Delaney
Senior Procurement Analyst
```

Then wait. The trigger polls every minute, and the document is read three times,
so allow **90 seconds to 2 minutes**. Nothing to click.

### If you have no attachment handy

Paste the whole solicitation into the body instead — the desk falls back to the
body text and flags that it did. Open `sample-solicitation.docx` and copy it in.

---

## Route B — by hand (~1 minute)

Dashboard → **Add a solicitation** → paste the text, or give a Drive / PDF link →
it asks you to confirm before submitting. Same path from there on.

Use this when a solicitation arrives somewhere the mailbox never sees.

---

## What should happen

| Where | What to look for |
|---|---|
| **Settings → Connections** | Three green lines, "Connected as aibuild@caravann.co" |
| **RFP queue** | One row, verdict badge, score, deadline |
| Open the row | Due **9 Oct 2026**, questions **25 Sep 2026**, budget **$165,000** |
| Gate | Four minimum qualifications, each pass / fail / **unclear** |
| Compliance | 25-page limit, portal-only, three references, insurance, business licence |
| Gaps | What Caravann cannot yet evidence |
| Questions | Two lanes — a public memo, and a private incumbent request |
| **Suggest team** | Three consultants, ranked, with rates |
| **Build draft** | 14 sections — 9 drafted, 5 marked *needs input* |
| **Open in Drive** | A folder, with the proposal as a native Google Doc |
| **Weekly review** | An edge case, if the desk was genuinely unsure |

### Three things worth checking closely

These were all real bugs. This is where you would see one come back.

1. **Each compliance item appears once.** It used to list insurance three times
   in three different phrasings.
2. **The Doc's cover reads `RFP No. RVA-2026-14`** — not a `gmail-…` id. An
   internal message id was being printed where the evaluator's own reference goes.
3. **No `[Insert …]` anywhere in the Doc.**

---

## What you will see that is not a bug

- **Every verdict says "provisional."** The eligibility profile is filled in from
  Caravann's own documents but nobody has confirmed it. Settings → tick *Profile
  confirmed* and the stamp goes. That is deliberately a person's decision.

- **Insurance and set-aside status are blank in the profile.** No document on
  file states either. A guessed insurance limit would make the gate clear a $2M
  requirement Caravann may not carry, and claiming a set-aside they do not hold
  is a false certification. Those two need Khaled; everything else does not.

- **The score is lower than you might expect.** The profile used to claim 12
  years and 34 engagements in public agencies. The truth, from the SamTrans
  proposal, is 5 years and 3 engagements — so the same solicitation went from 86%
  to 67%. That is the desk being honest, not broken.

- **Nothing notifies you.** There is no digest, no cron, no Slack or email
  summary. A solicitation is triaged the moment it arrives and then waits in the
  dashboard. Building a scheduled digest is a decision, not an oversight.

---

## Doing it twice

Send the same email again and the desk **updates the existing row** rather than
creating a second one — it dedupes on the Gmail message id. To start clean:
`npm run reset:queue -- --yes`. That clears solicitations and leaves the profile,
roster, language library and the connection health alone.
