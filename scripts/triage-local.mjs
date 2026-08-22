#!/usr/bin/env node
/**
 * Triage a solicitation with Claude Code standing in for OpenRouter.
 *
 *   node scripts/triage-local.mjs prompt <external_id>      writes the prompt to read
 *   node scripts/triage-local.mjs reconcile <external_id>   folds the reads in and files them
 *
 * Why this exists: triage costs real money per solicitation and the account
 * runs dry, which means the one thing nobody can test is the thing the whole
 * desk is built on. This runs the identical pipeline with a different reader.
 *
 * "Identical" is meant literally. The prompt and the reconciliation are NOT
 * reimplemented here - they are lifted out of n8n/rfp-intake-triage.json at
 * runtime and executed as-is, with a small shim standing in for the n8n
 * runtime. A local harness that reimplements the thing it is testing tests the
 * copy, and the copy starts drifting the day it is written; this one cannot
 * drift, because there is only one implementation and this file does not
 * contain it.
 *
 * The only substitution is who writes the JSON: Claude Code reads the prompt
 * file and writes the reads, where the deployed workflow POSTs to OpenRouter.
 * Same prompt, same schema, same reconciliation, same intake route.
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = join(ROOT, "scripts/scratch");

const raw = await readFile(join(ROOT, ".env.local"), "utf8");
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const APP = (process.env.BID_DESK_URL || "http://localhost:3000").replace(/\/$/, "");
const KEY = process.env.RFP_INTAKE_API_KEY;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** The workflow's own node bodies, executed rather than reproduced. */
async function nodeCode(name) {
  const wf = JSON.parse(await readFile(join(ROOT, "n8n/rfp-intake-triage.json"), "utf8"));
  const node = wf.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`no node named "${name}" in the workflow`);
  return node.parameters.jsCode;
}

/** Minimal n8n runtime: enough for these two Code nodes and nothing more. */
function runNode(code, { input, named }) {
  const $input = { all: () => input };
  const $ = (nodeName) => {
    if (!(nodeName in named)) throw new Error(`shim has no node "${nodeName}"`);
    return { all: () => named[nodeName] };
  };
  return Function("$input", "$", `${code}`)($input, $);
}

const [command, externalId] = process.argv.slice(2);
if (!command || (!externalId && command !== "selftest")) {
  console.error("usage: triage-local.mjs <prompt|reconcile> <external_id>");
  process.exit(1);
}
await mkdir(SCRATCH, { recursive: true });

// ── stage 1: build the prompt exactly as the workflow does ───────────────────
if (command === "prompt") {
  const { data: rfp } = await admin
    .from("rfps")
    .select("id,external_id,title,client_agency,source,source_url")
    .eq("external_id", externalId)
    .maybeSingle();
  if (!rfp) throw new Error(`no solicitation with external_id "${externalId}"`);

  const { data: doc } = await admin
    .from("source_documents")
    .select("body,name,characters")
    .eq("rfp_id", rfp.id)
    .eq("kind", "solicitation")
    .maybeSingle();
  if (!doc?.body) throw new Error(`"${externalId}" has no archived solicitation text to read`);

  const res = await fetch(`${APP}/api/rfps/context`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`context endpoint returned ${res.status}`);
  const context = await res.json();

  const payload = {
    external_id: rfp.external_id,
    title: rfp.title,
    client_agency: rfp.client_agency,
    source: rfp.source ?? "manual",
    source_url: rfp.source_url ?? null,
    source_mailbox: null,
    document_text: doc.body,
  };
  // One reader, because the reader is a person reading a file rather than three
  // parallel HTTP calls. The reconciliation still runs, and still has to cope.
  const config = { payload, models: "", triage_runs: 1, model: "claude-code/local", bid_desk_url: APP };

  const built = runNode(await nodeCode("Build triage prompt"), {
    input: [{ json: { text: doc.body } }],
    named: { Config: [{ json: config }], "Load triage context": [{ json: context }] },
  });

  const wf = JSON.parse(await readFile(join(ROOT, "n8n/rfp-intake-triage.json"), "utf8"));
  const orNode = wf.nodes.find((n) => n.name === "OpenRouter — triage");
  const schema = orNode.parameters.jsonBody.match(/json_schema:\s*\{[\s\S]*?\}\s*\}\s*\}\s*\}\s*\}\)/)?.[0] ?? "(schema not extracted)";

  for (const [i, item] of built.entries()) {
    await writeFile(join(SCRATCH, `prompt-${externalId}-${i}.txt`),
      `${item.json.system}\n\n${"=".repeat(78)}\nUSER MESSAGE\n${"=".repeat(78)}\n\n${item.json.user}\n`);
  }
  await writeFile(join(SCRATCH, `schema-${externalId}.txt`), schema);
  await writeFile(join(SCRATCH, `payload-${externalId}.json`), JSON.stringify({ config, contextKeys: Object.keys(context) }, null, 2));

  console.log(`document      ${doc.name} (${doc.characters.toLocaleString()} chars)`);
  console.log(`prompts       ${built.length} written to scripts/scratch/prompt-${externalId}-*.txt`);
  console.log(`system        ${built[0].json.system.length.toLocaleString()} chars`);
  console.log(`user          ${built[0].json.user.length.toLocaleString()} chars`);
  console.log(`context       ${Object.keys(context).join(", ")}`);
  console.log(`\nWrite each read as scripts/scratch/read-${externalId}-<n>.json, then:`);
  console.log(`  node scripts/triage-local.mjs reconcile ${externalId}`);
}

// ── selftest: the reconciliation, both directions ───────────────────────────
//
// Deduplication has to do two opposite things well, and fixing one is the
// obvious way to break the other. Across reads it must fold three phrasings of
// one obligation into a single line; within a read it must fold nothing,
// because the model was told to state each requirement once and anything it
// listed twice it meant. The version that shipped did the first and also did
// the second, which quietly deleted four of the five forms the Town of
// Leesburg requires back signed.
if (command === "selftest") {
  let passed = 0;
  const failures = [];
  const check = (name, condition, detail = "") => {
    if (condition) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
    else { failures.push(name); console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` - ${detail}` : ""}`); }
  };

  const base = {
    title: "T", client_agency: "A", project_type: null, status: "go",
    score_rubric: {
      sector_depth: { level: "adequate", note: null },
      comparable_engagements: { level: "several", note: null },
      geographic_fit: { level: "remote_ok", note: null },
      timeline: { level: "comfortable", note: null },
      budget_vs_effort: { level: "adequate", note: null },
    },
    verdict_why: "w", verdict_why_not: "n", budget_amount: null, budget_source: "none_listed",
    due_at: null, question_deadline_at: null,
    disqualifier_checks: [], gap_items: [], questions: [],
  };

  const reconcile = async (reads) => {
    const [{ json: out }] = runNode(await nodeCode("Reconcile triage runs"), {
      input: reads.map((r) => ({ json: { choices: [{ message: { content: JSON.stringify(r) } }] } })),
      named: {
        "Build triage prompt": reads.map((_, run) => ({
          json: { payload: { external_id: "selftest", title: "T", client_agency: "A" }, bid_desk_url: "", run, sol: 0, document_text: "d" },
        })),
      },
    });
    return out.body;
  };

  console.log("\nWithin one read, nothing is merged");
  {
    const forms = [
      "Offeror Submission Form (page 30)",
      "Acknowledgement of Addenda (page 31)",
      "Reference Form (page 32)",
      "Pricing Form (page 33)",
      "Proposal Protection Disclosure Form (page 34)",
    ].map((label) => ({ category: "manual_form", label, detail: "Sign by hand and return.", due_at: null }));
    const body = await reconcile([{ ...base, compliance_items: forms }]);
    check("all five signature forms survive", body.compliance_items.length === 5, `${body.compliance_items.length} of 5`);
    for (const f of forms) {
      check(`  ${f.label}`, body.compliance_items.some((c) => c.label === f.label));
    }

    const twoRegistrations = [
      { gap_type: "certification", description: "eVA vendor registration is not confirmed on file." },
      { gap_type: "certification", description: "Not recorded as authorized to transact business in Virginia; no State Corporation Commission registration." },
    ];
    const g = await reconcile([{ ...base, gap_items: twoRegistrations }]);
    check("two different registrations stay two gaps", g.gap_items.length === 2, `${g.gap_items.length} of 2`);
  }

  console.log("\nAcross reads, restatements still fold together");
  {
    const body = await reconcile([
      { ...base, compliance_items: [
        { category: "page_limit", label: "20-page limit", detail: null, due_at: null },
        { category: "deadline", label: "Proposal due date", detail: null, due_at: "2026-09-03T19:00:00Z" },
        { category: "insurance", label: "Minimum insurance coverage required", detail: null, due_at: null },
      ] },
      { ...base, compliance_items: [
        { category: "page_limit", label: "20-page proposal limit", detail: null, due_at: null },
        { category: "deadline", label: "Proposal submission deadline", detail: null, due_at: "2026-09-03T19:00:00Z" },
        { category: "insurance", label: "Commercial General Liability and Workers Compensation", detail: null, due_at: null },
      ] },
    ]);
    check("two phrasings of one page limit become one", body.compliance_items.filter((c) => c.category === "page_limit").length === 1);
    check("two phrasings of one deadline become one", body.compliance_items.filter((c) => c.category === "deadline").length === 1);
    check("two phrasings of one insurance rule become one", body.compliance_items.filter((c) => c.category === "insurance").length === 1);

    const g = await reconcile([
      { ...base, gap_items: [{ gap_type: "certification", description: "No Oregon Business Registry number on file; must be obtained before award." }] },
      { ...base, gap_items: [{ gap_type: "other", description: "Oregon Business Registry number is not confirmed on file; must be obtained." }] },
    ]);
    check("one gap written twice becomes one", g.gap_items.length === 1, `${g.gap_items.length}`);
  }

  console.log("\nAcross reads, distinct forms are still distinct");
  {
    const body = await reconcile([
      { ...base, compliance_items: [{ category: "manual_form", label: "Pricing Form (page 33)", detail: null, due_at: null }] },
      { ...base, compliance_items: [
        { category: "manual_form", label: "Pricing Form", detail: null, due_at: null },
        { category: "manual_form", label: "Reference Form (page 32)", detail: null, due_at: null },
      ] },
    ]);
    check("the same form named two ways is one item", body.compliance_items.filter((c) => /pricing/i.test(c.label)).length === 1);
    check("a different form is kept", body.compliance_items.some((c) => /reference/i.test(c.label)));
  }

  console.log("\nThe gate still only closes on unanimity");
  {
    const req = (result) => [{ requirement_text: "Must hold a 10% bid bond", is_required: true, is_hard_knockout: true, result, notes: null }];
    const both = await reconcile([{ ...base, disqualifier_checks: req("fail") }, { ...base, disqualifier_checks: req("fail") }]);
    check("two reads agreeing on a miss keeps it a fail", both.disqualifier_checks[0].result === "fail", both.disqualifier_checks[0].result);
    const split = await reconcile([{ ...base, disqualifier_checks: req("fail") }, { ...base, disqualifier_checks: req("pass") }]);
    check("a split read becomes unclear, not a fail", split.disqualifier_checks[0].result === "unclear", split.disqualifier_checks[0].result);
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
}

// ── stage 2: reconcile the reads and file them, as the workflow does ─────────
if (command === "reconcile") {
  const files = (await readdir(SCRATCH)).filter((f) => f.startsWith(`read-${externalId}-`) && f.endsWith(".json")).sort();
  if (files.length === 0) throw new Error(`no reads found - expected scripts/scratch/read-${externalId}-*.json`);

  // Shaped exactly like an OpenRouter response, so the reconcile node cannot
  // tell the difference and no branch of it goes untested.
  const responses = [];
  for (const f of files) {
    const content = await readFile(join(SCRATCH, f), "utf8");
    JSON.parse(content); // fail here rather than inside the node
    responses.push({ json: { choices: [{ message: { content } }] } });
  }

  const { data: rfp } = await admin.from("rfps").select("*").eq("external_id", externalId).maybeSingle();
  const { data: doc } = await admin
    .from("source_documents").select("body").eq("rfp_id", rfp.id).eq("kind", "solicitation").maybeSingle();

  const payload = {
    external_id: rfp.external_id, title: rfp.title, client_agency: rfp.client_agency,
    source: rfp.source ?? "manual", source_url: rfp.source_url ?? null, source_mailbox: null,
  };
  const promptItems = responses.map((_, run) => ({
    json: { payload, bid_desk_url: APP, run, sol: 0, document_text: doc?.body ?? null },
  }));

  const [{ json: out }] = runNode(await nodeCode("Reconcile triage runs"), {
    input: responses,
    named: { "Build triage prompt": promptItems },
  });

  console.log(`reads         ${out.runs} parsed, ${out.failed_runs} failed`);
  console.log(`rubric        ${Object.entries(out.body.score_breakdown).map(([k, v]) => `${k}=${v.level}`).join("  ")}`);
  if (Object.keys(out.dissent).length) console.log(`dissent       ${JSON.stringify(out.dissent)}`);
  console.log(`gate          ${out.body.disqualifier_checks.length} checks`);
  console.log(`compliance    ${out.body.compliance_items.length} items`);
  console.log(`gaps          ${out.body.gap_items.length}`);
  console.log(`questions     ${out.body.questions.length}`);
  console.log(`document      ${out.body.document_text ? `${out.body.document_text.length.toLocaleString()} chars archived` : "NOT archived"}`);

  const res = await fetch(`${APP}/api/rfps/intake`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(out.body),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`\nintake        http ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  if (!res.ok) process.exit(1);
}
