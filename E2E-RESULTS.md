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
<https://docs.google.com/document/d/18Nbx2jBIgA37fhIwMfr9zrUV7goQrG6UKrEfTSVB5tM/edit>

---

## 4. Known gaps, unchanged by this run

**The dashboard is never told the bid was filed.** `filing_status` stays
`not_filed` and `filing_url` stays empty, because no node reports back after the
Drive step. The files are genuinely in Drive; the dashboard's filing card just
does not know it. Fixing this needs a small write-back endpoint and one more
n8n node.

**Duplicates still survive the dedupe.** This run produced the 20-page limit
twice ("20-page proposal limit" and "20-page narrative limit"), the references
requirement twice, and the insurance requirement twice — plus two near-identical
Oregon-presence gaps. Roughly 13 compliance items for ~10 distinct requirements.
The three reads are unioned to protect recall, and this is the cost of that
choice.

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

## 5. Still not proven

**Accuracy against Khaled's judgement.** Everything above measures consistency
and recall against a key I wrote. Nobody has compared a verdict to what Khaled
would have decided. That count is still zero, and no amount of testing moves it —
it needs roughly 20 already-decided solicitations as an answer key.

**Behaviour on a genuinely long document.** This solicitation is realistic in
shape but short. A forty-page RFP with addenda is a different problem.

**The live Gmail trigger.** The watched mailbox is still empty and has never
fired. Send any email with "RFP" in the subject to the connected mailbox and it
will poll within the minute.

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
