# End-to-end test results

Run 2026-08-11 against the live stack: n8n Cloud, the Vercel app, Supabase,
OpenRouter and Google Drive. Nothing mocked.

Bid folders are created inside a dedicated Drive folder, `_RFP Desk test
artifacts`, so test runs stop landing in the root of anyone's Drive.

**Headline: 24 of 26 checks pass.** The two remaining failures are both real and
both worth reading; they are score variance and recall, in section B. The Drive
failures found in the first pass have been fixed and re-verified.

---

## A. Email parsing

The Gmail trigger's own code, run against realistic message shapes. This decides
*what actually gets triaged* when mail arrives.

| Result | Check | Detail |
|---|---|---|
| pass | a linked PDF is picked as the solicitation | `clackamas.us/files/rfp-2026-25.pdf` |
| pass | a portal link is used when there is no PDF | recognises PlanetBids, BidNet, Bonfire, sam.gov |
| pass | tracking and unsubscribe links are ignored | mailchimp, sendgrid, click-trackers, pixels |
| pass | the body is used instead, flagged as a summary | *"this is an aggregator summary, treat any budget as unconfirmed"* |
| pass | the same email twice keeps one id | `gmail-<message-id>`, so it updates rather than duplicates |
| pass | attachments are handled | `attachment_field` / `attachment_name` present |

**Not tested: the live Gmail trigger itself.** The watched mailbox is completely
empty and its credential is locked to Gmail nodes, so the address could not be
read and no test message could be sent into it. The parsing above is the code
that runs when mail lands; that it *lands* is unproven.

To close this: send any email with "RFP" in the subject to the connected
mailbox. It polls every minute.

---

## B. The whole flow, on a real solicitation

Clackamas County RFP #2026-25, "On-Call Organizational Development Strategic
Consulting Services", built from the county's own published Q&A and Addendum 1.
Four identical runs.

| Run | Verdict | Score | Time | Due date | Budget | Compliance | Gate | Gaps |
|---|---|---|---|---|---|---|---|---|
| 1 | maybe | 86% | 68s | 2026-08-27 | none listed | 11 | 4 | 9 |
| 2 | maybe | 86% | 71s | 2026-08-27 | none listed | 11 | 4 | 9 |
| 3 | maybe | **76%** | 57s | 2026-08-27 | none listed | 13 | 5 | 10 |
| 4 | maybe | 86% | 59s | 2026-08-27 | none listed | 9 | 4 | 8 |

| Result | Check | Detail |
|---|---|---|
| pass | the verdict is the same every run | all four `maybe` |
| **FAIL** | the score does not move | 10-point spread; run 3 came back 76% |
| pass | the due date is read correctly | 2026-08-27 on all four |
| pass | no budget is invented | reported as "none listed", which is correct |
| **FAIL** | every disqualifying rule is found every time | 6, 6, **5**, 6 of 6 |
| pass | unknowns are asked about, not failed | 2 marked `unclear`, holding the bid at maybe |
| pass | both question lanes are drafted | public memo + private incumbent request |
| pass | verdicts are stamped provisional | the profile is still unconfirmed |

### What the two failures mean

**The score moved on one run in four.** One rubric dimension flipped, costing 10
points. This is the model, and it has not gone away - an earlier four-run sample
happened to come back 86 every time, which was luck rather than proof.

What matters is that **the verdict did not move.** All four runs said `maybe`,
because the design puts the decision behind thresholds and a gate rather than
behind the raw number. That is exactly the failure this system was built to
absorb: the original problem was five runs scoring 55 to 90 and returning three
*different verdicts*, including a `no_go` on a winnable bid.

So: score variance reduced from 35 points to 10, verdict variance from three
outcomes to one. Not eliminated - absorbed.

**Recall dropped to 5 of 6 on the same run.** One of the six rules that can
disqualify a bid was missed once. Recall over long documents is the weakest axis
in the system and this is the honest evidence of it. The three-read union exists
precisely to reduce this and it clearly does not eliminate it.

---

## C. Filing to Drive

| Result | Check | Detail |
|---|---|---|
| pass | a bid folder is created automatically | verified by listing Drive directly |
| pass | named to Caravann's convention with the verdict lane | `[go] On-Call Organizational Development…_Clackamas County…_Caravann Consulting` |
| pass | created inside the nominated folder, not the Drive root | `_RFP Desk test artifacts` |
| pass | the same solicitation twice reuses the folder | two runs, **one** folder |
| pass | the folder is not empty | the verdict record is written into it |

### Two bugs found here and fixed

**The folders were empty.** This is what "there is nothing in Drive" actually
was. A folder was created for every bid, but a solicitation pasted in as text has
no file to upload, so nothing went in it. The desk now writes a record into every
bid folder - the verdict and reasoning, both deadlines, the budget, the compliance
checklist as tick boxes, every mandatory requirement with its result, and the
solicitation text - converted to a Google Doc on upload. Any attached PDF is still
filed alongside it.

**Re-triage made a second folder.** Four runs of one solicitation had left four
identical folders, which is worse than none: it is unclear which holds the current
work. The desk now looks for the folder before making one. Verified by running the
same solicitation twice and finding a single folder.

Also cleaned up: 75 stray folders in the root of the connected Drive from earlier
testing, plus everything left in the test folder from this run's earlier passes.

**Still imperfect:** each run writes its own record rather than replacing the
previous one, so a re-triaged bid accumulates a record per run. Defensible as
history, confusing as a folder listing.

---

## D. The proposal

| Result | Check | Detail |
|---|---|---|
| pass | every section drafts from Caravann's own language | **9 of 9** |
| pass | the real header and footer are carried | firm, service line, solicitation number, due date |
| pass | no machine-register vocabulary in any section | 0 tells across all nine |
| pass | placeholders fill from the solicitation | client name substituted into the opening line |

Assembled in Caravann's real nine-section structure, taken from the SamTrans
submission rather than guessed: Introduction, Background, Scope, Technical
Description, Past Performance, Price and Discounts, Terms and Conditions /
Warranty, Acknowledgement of Solicitation Amendments, Offeror Period for
Acceptance of Offers.

Opening line as generated:

> Caravann Consulting is pleased to submit this proposal in response to
> **Clackamas County, Oregon (H3S)**'s **On-Call Organizational Development
> Strategic Consulting Services**. Caravann is a strategy, facilitation, and
> organizational transformation firm that helps public agencies, mission-driven
> institutions, and complex multi-stakeholder organizations align leadership,
> strengthen operating models, and convert difficult conversations into
> practical action.

**Caveat on the Price section.** It drafts the rate-development methodology, not
a number. Eleven of thirteen consultants have no rate on record, so no cost table
can be assembled.

---

## E. Security

| Result | Check | Detail |
|---|---|---|
| pass | an anonymous caller cannot post a verdict | http 401 |
| pass | a wrong key is refused | http 401 |
| pass | cloud metadata cannot be fetched via a document link | http 400 on `169.254.169.254` |
| pass | client documents are not publicly readable | http 400 on the storage bucket |

---

## What is still not proven

**Accuracy against Khaled's judgement.** Every number here measures
*consistency*, not correctness. Nobody has compared a verdict to what Khaled
would have decided. That count is still zero, and no amount of testing moves it.

**Behaviour on a genuinely long document.** Everything so far has run on
solicitations assembled from published fragments. The one 5-of-6 recall miss is
the first real evidence that length hurts, and a forty-page RFP would hurt more.

**The live Gmail trigger**, as above.

---

## Fix list from this run

1. ~~Reuse the bid folder on re-triage~~ **done, verified**
2. ~~Write something into the bid folder~~ **done, verified**
3. **Send one email into the watched mailbox** to prove the trigger fires
4. **Run one genuinely long RFP** and measure recall against a hand-made list
5. **Get the eleven missing rates** so the Price section can carry a number
6. Replace the record on re-triage rather than adding another
