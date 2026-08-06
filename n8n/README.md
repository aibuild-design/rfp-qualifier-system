# n8n — intake & triage

The automation half of the bid desk. `rfp-intake-triage.json` is the source of
truth for the workflow; deploy it from here rather than hand-editing in the
n8n UI, or the next deploy overwrites those edits.

```
Intake webhook  →  Config  →  Load triage context  →  Document is a URL?
                                                       ├─ yes → Download → Extract PDF text ─┐
                                                       └─ no ─────────────────────────────────┤
                                                                                              ↓
   Respond  ←  POST to bid desk  ←  Shape intake payload  ←  OpenRouter triage  ←  Build prompt
```

## What it does

One solicitation in, one verdict out. The model reads the whole document in a
single pass (`anthropic/claude-sonnet-5`, 1M context — a 59-page RFP goes in
whole, no chunking, which is what stops a page-52 disqualifier from being
missed) and returns a strict-schema JSON verdict: go/no-go/maybe, a capability
overlap score, the gap list, the compliance checklist, and drafted questions.

Caravann-specific judgement comes entirely from `GET /api/rfps/context` —
the eligibility profile and sector map Khaled confirms in Settings. Nothing
about Caravann is hardcoded in the workflow, so editing the sector map changes
the verdicts.

## Setup

Two credentials, both **Header Auth**, created once in the n8n UI:

| Credential name | Header | Value |
| --- | --- | --- |
| `Bid Desk API key` | `Authorization` | `Bearer <RFP_INTAKE_API_KEY>` |
| `OpenRouter API key` | `Authorization` | `Bearer <OPENROUTER_API_KEY>` |

One env var on the n8n instance: `BID_DESK_URL` → the deployed app's origin.

Then:

```bash
npm run n8n:validate   # check the graph parses and every connection resolves
npm run n8n:deploy     # create or update the workflow (needs N8N_BASE_URL + N8N_API_KEY)
```

## Calling it

```bash
curl -X POST https://<n8n>/webhook/rfp-intake \
  -H 'Content-Type: application/json' \
  -d '{
    "external_id": "samtrans-2026-114",
    "source": "aggregator",
    "document_url": "https://example.gov/rfp-2026-114.pdf"
  }'
```

`document_url` is fetched and text-extracted. For portal-gated solicitations —
which Phase 1 deliberately does not log into — drop the text in directly as
`document_text` instead. `title`, `client_agency`, `source_url` are optional;
supply them when the aggregator email already named them and they'll override
the model's reading.

`external_id` is the dedupe key: re-posting the same one after an addendum
re-triages and updates the existing RFP rather than creating a duplicate.

## Testing

```bash
npm run triage:test            # all fixtures
npm run triage:test transit    # one
DUMP=1 npm run triage:test     # full JSON output
```

This extracts and runs the workflow's **real** Code-node JavaScript and its
OpenRouter request body — not a copy — against fixtures in
`fixtures/solicitations.mjs`, then asserts the verdict. Each fixture carries a
specific trap the SOW names as a live failure mode:

| Fixture | Trap | Expected |
| --- | --- | --- |
| transit-facilitation | 3 references, one upload slot, buried in §5.4 | `go`, budget from RFP |
| behavioral-health | hard disqualifier buried in §5.4 of a scope that otherwise fits | `no_go`, no budget listed |
| k12-omaha | budget only in the attached Q&A; local presence preferred not required | `maybe`, budget from Q&A |

Testing a copy of the prompt would let workflow and test drift apart silently —
which is exactly the bug this is meant to catch. Costs a few cents per run.

## Not in Phase 1

No portal logins, no auto-submit, no scheduled sourcing. The webhook is the
entry point; the Gmail/schedule trigger in front of it is a small addition once
Khaled confirms the aggregator's email format.
