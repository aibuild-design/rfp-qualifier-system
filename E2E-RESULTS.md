# End-to-end test results

Run **12 August 2026** against the live stack: n8n Cloud, the Vercel
deployment, Supabase, OpenRouter and Google Drive. Nothing mocked, nothing
stubbed. The solicitation went in through the real webhook and the proposal came
out as a real Google Doc in a real Drive folder.

**Headline: the chain works end to end, and this run found a real bug in it.**
Every bid was being filed into a folder labelled `[go]` regardless of the
verdict. Found, fixed, redeployed, and re-verified in the same session — the
evidence for all three is below.

---

## 0. What was cleaned first

Drive had accumulated **32 test artifacts** across two bid folders and three
conversion probes — one folder alone held 25 files, because each re-triage
writes its own copy rather than replacing the last one.

All 32 removed. Deliberately **not** touched: `Caravann Consulting` and
`Caravann<>OH`, the two real client folders in the Drive root. Nothing outside
the dedicated `_RFP Desk test artifacts` folder was ever in scope.

The queue was also holding 10 identical rows from repeated testing. Cleared with
`npm run reset:queue`, which leaves the profile, sector map, roster, language
library and thresholds alone.

Final state after this run: **one** bid folder in Drive, **one** row in the
queue. Both from the run documented here.

---

## 1. The run

| | |
|---|---|
| Solicitation | Clackamas County H3S, RFP 2026-25, On-Call Organizational Development and Strategic Consulting Services |
| Entry point | `POST /webhook/rfp-intake` on n8n Cloud |
| Wall clock | **51 seconds**, webhook to response |
| n8n nodes run | **19 of 19**, zero errors |
| Verdict | **maybe, 86%** |
| Marked provisional | yes — the profile is still unconfirmed |

The document is assembled to the shape of a real published solicitation, and the
answer key below was **written before the run**, so recall is measured against
something fixed in advance rather than graded afterwards.

### Verdict quality

| Result | Check | Detail |
|---|---|---|
| pass | the due date is read correctly | `2026-08-27 21:00Z` = 2:00 PM Pacific, exactly as written |
| pass | no budget is invented | reported as none listed — correct, it is an on-call contract with no guaranteed minimum |
| pass | the verdict is held, not forced | 4 requirements came back `unclear`, 0 `fail` → `maybe`, not a false `no_go` |
| pass | the verdict is stamped provisional | the profile is unconfirmed, and the row records that at decision time |

### Recall against the answer key — 8 of 8

| # | Must find | Found as |
|---|---|---|
| 1 | 5 years public-sector OD consulting | gate, `pass` |
| 2 | 3 comparable engagements within 7 years | gate, `pass` |
| 3 | Facilitating elected or appointed bodies | gate, `unclear` |
| 4 | Oregon business registration at award | gate, `unclear` |
| 5 | $2M general liability insurance | gate + compliance |
| 6 | 20-page limit | compliance, `page_limit` |
| 7 | OregonBuys portal only, no email | compliance, `submission` |
| 8 | Three public-agency references | compliance, `submission` |

This is the best recall measured so far. The previous run in this file scored
5–6 of 6 across four attempts, missing one on one run.

### What it produced

- **6 gate checks** — 2 pass, 4 unclear, 0 fail
- **13 compliance items** — deadlines, page limit, portal, forms, references, insurance, evaluation weighting
- **7 gaps** — including the two that actually matter: no documented experience facilitating elected officials, and no Oregon presence for a three-year on-call contract
- **4 drafted questions** — 3 for the public Q&A memo, 1 as a private incumbent request

---

## 2. The bug this run found

**Every bid was filed into a `[go]` folder, whatever the verdict.**

The intake endpoint answered `{ id, status: "ok", proposal_docx }`. The n8n
filing step read the verdict out of `status`:

```js
const verdict = v.status || 'pending';
const folder = verdict === 'no_go' ? 'no-go' : verdict === 'maybe' ? 'maybe' : 'go';
```

`"ok"` is not a verdict. It matched neither branch and fell through to the
default, `'go'`. Nothing threw. The folder was created, the files went in, the
run was marked successful — and the label was wrong every single time.

**A no-go would have been filed into a folder marked `[go]`**, which is the one
thing the lane in the folder name exists to prevent.

This is the same class of failure as the earlier bug that named every folder
`__Caravann Consulting`: a field read off the intake response that means
something other than what its name suggests.

**Correction to the previous version of this document.** It recorded *"named to
Caravann's convention with the verdict lane — pass"*. That was wrong. The lane
was `[go]` on a `maybe` verdict, and I marked it passing without checking the
label against the decision.

### The fix, and the proof

The endpoint now returns the decided verdict as its own field rather than
overloading `status`, which is its success flag and is checked elsewhere. The
n8n node reads `v.verdict`.

| | Folder created |
|---|---|
| Before, verdict `maybe` | `[go] On-Call Organizational Development…` |
| After, verdict `maybe` | `[maybe] On-Call Organizational Development…` |

Both runs are real runs against the live stack, before and after the deploy.

---

## 3. Filing to Drive

| Result | Check | Detail |
|---|---|---|
| pass | a bid folder is created automatically | verified by listing Drive directly, not by trusting the workflow |
| pass | the lane matches the verdict | `[maybe]` on a `maybe` — after the fix above |
| pass | named to Caravann's convention | `[lane] Engagement_Client_Caravann Consulting` |
| pass | created inside the nominated folder | `_RFP Desk test artifacts`, not the Drive root |
| pass | the proposal lands as a native Google Doc | not a .docx needing a conversion click |
| pass | the solicitation is filed beside it | as text, since this one arrived as text |

```
_RFP Desk test artifacts/
└── [maybe] On-Call Organizational Development and Strategic Consulting
    Services_Clackamas County, Oregon (H3S)_Caravann Consulting/
    ├── … - proposal draft      Google Doc, Caravann's own template, filled
    └── … - solicitation        the RFP text as received
```

The proposal from this run:
<https://docs.google.com/document/d/1jFbeuFje_V2aqKOg7xJSJdPG5BgApbNr0tzeWjCQROs/edit>

---

## 4. Two of those gaps, fixed and re-verified

### Filing now reports back — done

`filing_status` sat on `not_filed` and `drive_folder_url` stayed empty, because
nothing told the dashboard after the Drive step. The card reported "Not filed"
over files that were demonstrably in Drive — the one state it could never leave.
A card that contradicts reality is worse than one that says nothing, because it
teaches you to distrust the field.

Added `POST /api/rfps/filing` and one n8n node that calls it once the Drive work
is done. Both sides of the "is there a file to file?" branch converge on it: a
solicitation that arrived as a link still has a folder and a proposal in it, so
it is still filed.

Verified on a live run:

| Field | Before | After |
|---|---|---|
| `filing_status` | `not_filed` | **`filed`** |
| `filed_at` | null | `2026-08-12T16:12:50Z` |
| `drive_folder_url` | null | the real folder |
| `filing_error` | null | null |

`filed_at` is stamped only on success and `filing_error` cleared on it, so a
folder that failed once and then filed does not keep an old error sitting under
a green badge.

The card also carried a footer reading *"Not yet connected… no files move."*
That went stale the day the Drive credential was authorised. Removed.

### Dedupe — improved, not solved

`norm()` **deleted** punctuation rather than splitting on it. So `public-agency`
became the single token `publicagency`, sharing nothing with `public agency`,
and `20-page` became `20page`, which meant the `page → pg` synonym never fired
on the one phrase it exists for. Both duplicate pairs from the previous run
survived for exactly that reason.

Splitting on punctuation instead: **6 of 6** on the pairs that run produced, up
from 4 of 6 — and the cases that must *not* merge still don't, because the
number is its own token:

| Pair | Before | After |
|---|---|---|
| "20-page proposal limit" / "20-page narrative limit" | kept both | merged |
| "Three public-agency references" / "Three public agency references required" | kept both | merged |
| "20-page limit" / "10-page limit" | kept both | **kept both** |
| two unrelated deadlines | kept both | **kept both** |

On the next live run the page limit, the references and the insurance rule each
appeared **once**, where all three had been doubled.

**It is not solved, and it will not be by this approach.** The same run threw up
new duplicates in new wording — "Evaluation weighting" against "Evaluation
scoring weights", "Required forms" against "Required forms: W-9 and signed
Addendum Acknowledgement". Three independent reads phrase things three ways, and
each run invents fresh ones.

Stemming was tried and **rejected**. It merges weighting/weights correctly, but
it also merges "Insurance certificates due post-award" with "Insurance minimums
post-award", which are two different obligations. Net 7 of 8 either way — the
same score, with the error moved to the expensive side. Merging two distinct
requirements *loses a compliance rule*; keeping a duplicate costs one redundant
line. Given that recall is the weakest axis in the system, the trade is wrong,
so the dedupe stays deliberately conservative.

### Still open

**Item counts move between runs.** The same solicitation produced 15 compliance
items and 10 gaps on the first run and 13 and 7 on the second. The *verdict* and
*score* were identical both times — 86%, `maybe` — which is the property that
was engineered for. The detail list is advisory; the decision is stable.

**Each re-triage writes another copy** rather than replacing the previous one.
This is why 25 files had accumulated in one folder.

**Proposal sections and team assignments are not written by triage.** This is by
design, not a fault: the dashboard has explicit *Build draft* and *Suggest team*
buttons. The .docx filed to Drive is assembled in memory at intake time.

---

## 4b. The email trigger, finally proven

This had never fired. Not once, across the whole build — the mailbox was empty
and I had no way to send into it, so the entire email path was untested code.

The blocker was that nobody knew the watched address. The Gmail credential is
locked to Gmail nodes, so the Gmail API's own profile endpoint is unreachable
through an HTTP node — it fails with *"This credential is configured to prevent
use within an HTTP Request or GraphQL node"*. Reading the mailbox through a
Gmail node instead exposed it in a message header: **aibuild@caravann.co**.

The three messages already sitting in that inbox were promotions with nothing
matching `subject:(RFP OR RFQ OR solicitation …)`, which is exactly why the
trigger had never had anything to fire on.

Sent one solicitation notice in. The trigger picked it up and ran the whole
chain — **22 nodes, no errors**, from the email to a filed Google Doc:

| Field | Value | Correct? |
|---|---|---|
| `source` | `email` | yes |
| `external_id` | `gmail-19ff6ef7def5552f` | the message id, so re-delivery updates rather than duplicates |
| title | Strategic Planning and Board Facilitation Services | yes — the RFP number is stripped from the subject |
| agency | Marin County Health and Human Services | yes — read out of the body |
| due | 2026-09-18 | yes |
| questions due | 2026-09-04 | yes |
| verdict | maybe, 86% | — |
| filing | `filed`, folder created | yes |

Both entry points are now demonstrated end to end and both bid folders are in
Drive: one entered by hand, one that arrived as an email.

---

## 4c. The team matcher was broken, and said so quietly

Run against a real solicitation, the best consultant on the roster scored
**11** — *"matches 1 of 9 stated requirements"*. That reads as "nobody here is
suitable". It was the matcher.

**Spelling.** The roster is British English because Khaled wrote it —
"Organi**s**ational development". American agencies write
"organi**z**ational". A substring test never fires across that one letter, so
the single most common word in this domain matched nothing. Same for
"facilitating" against "facilitation".

**Denominator.** Coverage was divided by every gate check, but most are about
the document, not the team: a twenty-page limit, a W-9, a certificate of
insurance, Oregon registration. No human satisfies a page limit, so everyone
was capped near 11%.

Both fixed — spellings folded on both sides, and the denominator narrowed to
the requirements at least one member matches, so document rules drop out on
their own rather than needing a maintained keyword list.

| | Before | After |
|---|---|---|
| Sarah Lightfoot | 11 — "1 of 9" | **67 — "2 of 3"** |
| Kia Afcari | 11 — "1 of 9" | 33 — "1 of 3" |
| Terrell Holmes | 11 — "1 of 9" | 33 — "1 of 3" |

**Rates are placeholders.** All 13 consultants now carry one so the card renders
a complete recommendation, but only two are real (Khaled 285, Trent 125); the
other eleven are plausible tier-based stand-ins. Khaled must replace them before
any is quoted. Safe to seed because `rate` is display-only — it renders on the
team card and is never written into the proposal document, so no invented number
can reach a client-facing file.

---

## 5. Still not proven

**Accuracy against Khaled's judgement.** Everything above measures consistency
and recall against a key I wrote. Nobody has compared a verdict to what Khaled
would have decided. That count is still zero, and no amount of testing moves it —
it needs roughly 20 already-decided solicitations as an answer key.

**Behaviour on a genuinely long document.** This solicitation is realistic in
shape but short. A forty-page RFP with addenda is a different problem.


---

## 6. Security spot-checks

| Result | Check | Detail |
|---|---|---|
| pass | an anonymous caller cannot post a verdict | `POST /api/rfps/intake` → 401 on the live deployment |
| pass | client documents are not publicly readable | the template with Caravann's EIN stays in a private bucket |
| pass | no client documents in the public repo | `.docx/.pdf/.xlsx` gitignored; the changeset for this session is code only |

---

## 7. Repo health at the end of this session

- `npm run build` — compiles clean
- `npm run lint` — 0 errors (8 pre-existing warnings, none in changed files)
- `npm run verify` — **163/163 checks pass**, 1 skipped (needs a demo RFP)
