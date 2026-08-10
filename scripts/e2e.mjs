#!/usr/bin/env node
// End-to-end check of the path n8n drives, minus the n8n hop itself:
//
//   fixture solicitation → OpenRouter triage → POST /api/rfps/intake
//     → Supabase → the exact queries the dashboard pages run
//
// Verifies the pieces that unit tests can't: that the schema accepts what the
// triage produces, that upsert-on-external_id is genuinely idempotent, and
// that the dashboard's ranking/filtering returns what it should.
//
//   node scripts/e2e.mjs             # run, then clean up test rows
//   node scripts/e2e.mjs --keep      # leave the test RFP in place to look at
//
// Needs a dev server on APP_URL (default http://localhost:3000) and a real
// Supabase project in .env.local. Test rows use a "e2e-" external_id prefix
// and are deleted at the end unless --keep.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { CARAVANN_CONTEXT, FIXTURES } from "../n8n/fixtures/solicitations.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const PREFIX = "e2e-";

async function loadEnv() {
  const raw = await readFile(join(HERE, "..", ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

let passed = 0;
let failed = 0;
function assert(cond, label, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

// Reuse the workflow's own prompt/shaping code so this exercises the shipped
// artifact, same as n8n/test-triage.mjs.
function runCodeNode(jsCode, { input, nodes }) {
  const $input = { first: () => input, all: () => [input] };
  const $ = (name) => ({ first: () => nodes[name], all: () => [nodes[name]] });
  return new Function("$input", "$", `"use strict";\n${jsCode}`)($input, $);
}

async function triage(fixture) {
  const wf = JSON.parse(await readFile(join(HERE, "..", "n8n", "rfp-intake-triage.json"), "utf8"));
  const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));

  const config = {
    json: {
      bid_desk_url: APP_URL,
      model: "anthropic/claude-sonnet-5",
      payload: {
        external_id: PREFIX + fixture.external_id,
        source: "manual",
        document_text: fixture.text,
      },
    },
  };

  const promptOut = runCodeNode(byName["Build triage prompt"].parameters.jsCode, {
    input: { json: {} },
    nodes: { Config: config, "Load triage context": { json: CARAVANN_CONTEXT } },
  });

  const expr = byName["OpenRouter - triage"].parameters.jsonBody
    .replace(/^=\{\{/, "")
    .replace(/\}\}$/, "");
  const requestBody = JSON.parse(new Function("$json", `return (${expr});`)(promptOut[0].json));

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const shaped = runCodeNode(byName["Shape intake payload"].parameters.jsCode, {
    input: { json: await res.json() },
    nodes: { "Build triage prompt": promptOut[0] },
  });
  return shaped[0].json.body;
}

async function postIntake(body) {
  const res = await fetch(`${APP_URL}/api/rfps/intake`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RFP_INTAKE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

async function main() {
  await loadEnv();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  // ── 0. app reachable ──────────────────────────────────────────────────────
  console.log(`\n▸ App at ${APP_URL}`);
  try {
    const res = await fetch(`${APP_URL}/login`);
    assert(res.ok, `login page responds (${res.status})`);
  } catch (err) {
    console.error(`  ✗ cannot reach ${APP_URL} - is the dev server running?\n    ${err.message}`);
    process.exit(1);
  }

  // ── 1. auth gate on the dashboard ─────────────────────────────────────────
  console.log("\n▸ Auth gate");
  const dash = await fetch(`${APP_URL}/dashboard`, { redirect: "manual" });
  assert(
    [302, 307].includes(dash.status) && (dash.headers.get("location") ?? "").includes("/login"),
    `unauthenticated /dashboard redirects to /login (${dash.status})`
  );

  // ── 2. context endpoint serves what the prompt needs ──────────────────────
  console.log("\n▸ GET /api/rfps/context");
  const ctxRes = await fetch(`${APP_URL}/api/rfps/context`, {
    headers: { Authorization: `Bearer ${process.env.RFP_INTAKE_API_KEY}` },
  });
  const ctx = await ctxRes.json();
  assert(ctxRes.status === 200, `returns 200 (${ctxRes.status})`);
  assert(ctx.org_profile !== null, "org_profile row exists (migration seeded it)");
  assert(Array.isArray(ctx.sector_experience), "sector_experience is an array");

  // ── 3. triage → intake → Supabase ─────────────────────────────────────────
  const fixture = FIXTURES.find((f) => f.name.startsWith("transit"));
  console.log(`\n▸ Triage + intake - ${fixture.name}`);
  const body = await triage(fixture);
  assert(["go", "no_go", "maybe"].includes(body.status), `triage returned a verdict (${body.status})`);

  const first = await postIntake(body);
  assert(first.status === 200, `intake accepted (${first.status})`, JSON.stringify(first.json).slice(0, 200));
  const rfpId = first.json.id;
  assert(Boolean(rfpId), "intake returned an id");

  // ── 4. rows actually landed ───────────────────────────────────────────────
  console.log("\n▸ Rows in Supabase");
  const { data: rfp } = await supabase.from("rfps").select("*").eq("id", rfpId).single();
  assert(Boolean(rfp), "rfps row exists");
  assert(rfp?.external_id === PREFIX + fixture.external_id, "external_id round-tripped");
  assert(rfp?.status === body.status, `status persisted (${rfp?.status})`);
  assert(rfp?.budget_source === "rfp" && Number(rfp?.budget_amount) === 185000, "budget read from RFP, not guessed");
  assert(rfp?.due_at !== null, "due date parsed and stored");

  for (const [table, label] of [
    ["rfp_gap_items", "gap items"],
    ["rfp_compliance_items", "compliance items"],
    ["rfp_disqualifier_checks", "disqualifier checks"],
    ["rfp_questions", "questions"],
  ]) {
    const { count } = await supabase.from(table).select("*", { count: "exact", head: true }).eq("rfp_id", rfpId);
    assert((count ?? 0) > 0, `${label} written (${count})`);
  }

  // ── 5. idempotency - the addendum re-triage case ──────────────────────────
  console.log("\n▸ Re-post same external_id (addendum re-triage)");
  const second = await postIntake({ ...body, score_percent: 71, verdict_why: "rescored after addendum" });
  assert(second.status === 200, `second post accepted (${second.status})`);
  assert(second.json.id === rfpId, "same row updated, not duplicated");

  const { count: rfpCount } = await supabase
    .from("rfps")
    .select("*", { count: "exact", head: true })
    .eq("external_id", PREFIX + fixture.external_id);
  assert(rfpCount === 1, `exactly one rfps row for that external_id (${rfpCount})`);

  const { data: rescored } = await supabase.from("rfps").select("score_percent").eq("id", rfpId).single();
  assert(Number(rescored?.score_percent) === 71, "updated fields took effect");

  const { count: gapCount } = await supabase
    .from("rfp_gap_items")
    .select("*", { count: "exact", head: true })
    .eq("rfp_id", rfpId);
  assert(gapCount === body.gap_items.length, `children replaced not appended (${gapCount} = ${body.gap_items.length})`);

  // ── 6. the dashboard's own queries ────────────────────────────────────────
  console.log("\n▸ Dashboard queries");
  const { data: ranked } = await supabase
    .from("rfps")
    .select("*")
    .neq("status", "no_go")
    .order("score_percent", { ascending: false, nullsFirst: false });
  assert(Array.isArray(ranked), "queue query runs");
  const scores = (ranked ?? []).map((r) => r.score_percent).filter((s) => s !== null);
  assert(
    scores.every((s, i) => i === 0 || Number(scores[i - 1]) >= Number(s)),
    "queue is ordered by score, highest first"
  );

  const { data: noGo } = await supabase.from("rfps").select("id").eq("status", "no_go");
  assert(Array.isArray(noGo), "no-go folder query runs");

  // ── cleanup ───────────────────────────────────────────────────────────────
  if (!process.argv.includes("--keep")) {
    const { error } = await supabase.from("rfps").delete().like("external_id", `${PREFIX}%`);
    assert(!error, "test rows cleaned up");
    const { count } = await supabase
      .from("rfp_gap_items")
      .select("*", { count: "exact", head: true })
      .eq("rfp_id", rfpId);
    assert(count === 0, "child rows cascade-deleted");
  } else {
    console.log(`\n  · kept ${rfpId} - view at ${APP_URL}/dashboard/rfps/${rfpId}`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nthrew: ${err.message}`);
  process.exit(1);
});
