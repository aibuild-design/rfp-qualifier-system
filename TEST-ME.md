# Test it yourself

Everything below runs against the live system. No setup, no terminal.

**Dashboard:** https://rfp-qualifier-system.vercel.app
**Login:** `khaled@caravann.co` — password is in `.env.local` as `VERIFY_LOGIN_PASSWORD`
**Watched mailbox:** `aibuild@caravann.co`

The queue is empty on purpose. The profile, the 13 consultants and Caravann's 12
approved-language blocks are still there — without those nothing can draft.

---

## Test 1 — the whole thing, from an email (5 minutes)

This is the one that matters. Everything else is a detail of it.

**1. Send an email to `aibuild@caravann.co`.** Anything with "RFP" in the subject.
Paste a real solicitation if you have one. If not, use this — it is written to
exercise every part of the desk:

> **Subject:** RFP No. TEST-2026-01 — Strategic Planning and Facilitation Services
>
> City of Fremont, Community Services Department
>
> The City seeks a consultant to facilitate a strategic planning process for its
> Community Services Department, including three staff workshops and a written
> five-year plan. Estimated budget is $95,000.
>
> Written questions due: November 14, 2026, 5:00 PM Pacific.
> Proposals due: December 4, 2026, 2:00 PM Pacific. Late proposals are rejected.
>
> MINIMUM QUALIFICATIONS — failure to meet any one is grounds for rejection:
>  1. At least five (5) years of strategic planning consulting for public agencies.
>  2. At least three (3) comparable municipal engagements in the last five years.
>  3. Demonstrated experience facilitating elected officials.
>
> INSURANCE. Commercial General Liability of not less than $1,000,000 per
> occurrence, and Workers Compensation as required by California law.
>
> SUBMISSION. Proposals shall not exceed twenty (20) pages excluding resumes.
> Electronic submission through the City portal only. Include three (3)
> references from public agency clients.
>
> Contact: Janine Ortiz, Purchasing Agent, jortiz@fremont.example.gov,
> (510) 555-0188. 3300 Capitol Ave, Fremont, CA 94538.

**2. Wait 90 seconds to 2 minutes.** Nothing to click. The trigger polls the
mailbox every minute, then the document is read three times.

**3. Open the dashboard.** The solicitation is in the queue with a verdict.

### What to check

| Where | What should be true |
|---|---|
| **RFP queue** | One row, verdict badge, score, deadline in Pacific |
| Open the row | Due **Dec 4 2026**, questions **Nov 14 2026**, budget **$95,000** |
| Gate | Each minimum qualification listed, marked pass / fail / unclear |
| Compliance | 20-page limit, portal-only, three references, insurance — **one line each, no repeats** |
| Gaps | What Caravann can't yet evidence |
| Questions | Two lanes: a public memo, and a private incumbent request |
| **Weekly review** | Flags it only if the desk was genuinely unsure |

**The trap to check:** every compliance item should appear **once**. Three
separate insurance lines saying the same thing was a real bug — it is fixed, and
this is where you'd see it come back.

---

## Test 2 — the proposal (2 minutes)

On the solicitation page:

1. **Suggest team** → three consultants ranked, with why and their rate.
2. **Build draft** → 14 sections. Nine draft from Caravann's own language, five
   say `needs input` (appendices and certifications — those need attachments,
   not writing).
3. **Open in Drive** → the folder, with the proposal as a **native Google Doc**.

### On the Doc, check the cover page

- Solicitation number reads **`RFP No. TEST-2026-01`** — not a `gmail-…` id.
  That was a real bug: an internal message id printed where the evaluator
  expects their own reference.
- **Prepared For** block filled: Janine Ortiz, the email, the phone, the address.
- **No `[Insert …]` placeholders anywhere.**
- Page 2 is not blank; the appendix numbering does not restart at 1.

---

## Test 3 — the phone (1 minute)

Open the dashboard on your phone.

- **Hamburger, top left** → the dark sidebar slides in.
- Everything is in it: nav, the attention counts, your email, theme, **Sign out**.
- Close it four ways: the X, tapping outside, Escape, or tapping any link.

---

## Test 4 — add one by hand (1 minute)

**Add a solicitation** → paste text or a Drive/PDF link → it confirms before
submitting. Same path as email, minus the mailbox.

---

## What is deliberately not finished

Two things, and both are yours rather than bugs:

1. **Every verdict says "provisional."** The eligibility profile is not
   confirmed. Settings → Profile → confirm it, and the stamp goes. It is
   deliberately your sign-off, not something the system ticks for itself.

2. **11 of 13 rates are placeholders.** Settings → Team roster → type over them;
   it saves as you type. They only show on the team card — they never enter a
   proposal, so nothing invented can reach an agency.

## The one thing no test here can tell you

Everything above proves the desk is **consistent** — the same solicitation gets
the same verdict. Whether that verdict matches **your** judgement is unmeasured,
because nobody has compared one to a call you actually made.

Roughly **20 solicitations you have already decided** closes that, and it is the
single highest-value thing left. Send them and the desk can be scored against
you instead of against itself.
