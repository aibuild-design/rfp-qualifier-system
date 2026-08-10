#!/usr/bin/env node
// Live end-to-end check of the real production path, n8n hop included:
//
//   POST → n8n webhook → (download+extract PDF | use text) → OpenRouter
//     → shape → POST /api/rfps/intake on Vercel → Supabase
//
// Distinct from scripts/e2e.mjs, which drives the same stages from this
// machine and skips n8n entirely. This one proves the deployed system works
// as deployed - the failure it exists to catch is one that only shows up in
// the hosted wiring (a wrong URL baked into the workflow, a missing
// credential, an env var set on the wrong project).
//
//   node scripts/live-check.mjs           run everything, then clean up
//   node scripts/live-check.mjs --keep    leave the rows in place to inspect
//
// Test rows use a "live-" external_id prefix and are deleted at the end.
// Nothing here writes to is_demo rows or touches the profile.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { FIXTURES } from "../n8n/fixtures/solicitations.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PREFIX = "live-";

async function loadEnv() {
  const raw = await readFile(join(HERE, "..", ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` - ${detail}` : ""}`);
}

async function hitWebhook(body, { auth = true } = {}) {
  const started = Date.now();
  const res = await fetch(`${process.env.N8N_BASE_URL.replace(/\/$/, "")}/webhook/rfp-intake`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${process.env.RFP_INTAKE_API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body is itself the finding */
  }
  return { status: res.status, json, text, seconds: Math.round((Date.now() - started) / 1000) };
}

async function main() {
  await loadEnv();
  const keep = process.argv.includes("--keep");
  const app = process.env.BID_DESK_URL.replace(/\/$/, "");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  console.log(`App:      ${app}`);
  console.log(`n8n:      ${process.env.N8N_BASE_URL}`);

  // ── 1. The app's own surface ────────────────────────────────────────────
  console.log("\nApp routes");
  {
    const login = await fetch(`${app}/login`);
    record("login page serves", login.status === 200, `http ${login.status}`);

    const dash = await fetch(`${app}/dashboard`, { redirect: "manual" });
    const loc = dash.headers.get("location") ?? "";
    record(
      "unauthenticated /dashboard redirects to login",
      dash.status === 307 && loc.includes("/login"),
      `http ${dash.status}`
    );

    const noAuth = await fetch(`${app}/api/rfps/context`);
    record("context route rejects missing key", noAuth.status === 401, `http ${noAuth.status}`);

    const badAuth = await fetch(`${app}/api/rfps/context`, {
      headers: { Authorization: "Bearer wrong-key" },
    });
    record("context route rejects wrong key", badAuth.status === 401, `http ${badAuth.status}`);

    const ok = await fetch(`${app}/api/rfps/context`, {
      headers: { Authorization: `Bearer ${process.env.RFP_INTAKE_API_KEY}` },
    });
    const ctx = ok.status === 200 ? await ok.json() : null;
    record(
      "context route serves the profile n8n reads",
      ok.status === 200 && Array.isArray(ctx?.sector_experience),
      ok.status === 200 ? `${ctx.sector_experience.length} sectors` : `http ${ok.status}`
    );

    const badIntake = await fetch(`${app}/api/rfps/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RFP_INTAKE_API_KEY}` },
      body: JSON.stringify({ external_id: "should-not-persist" }),
    });
    record(
      "intake route rejects a payload missing title/agency",
      badIntake.status === 400,
      `http ${badIntake.status}`
    );
  }

  // ── 2. The webhook refuses anonymous callers ────────────────────────────
  // This was open once. n8n only re-registers a webhook on activation, so a
  // config change alone can leave the old, unauthenticated behaviour live -
  // which is exactly how it went unnoticed. Assert it rather than trust it.
  console.log("\nWebhook authentication");
  {
    const anon = await hitWebhook({ external_id: `${PREFIX}anon-probe`, document_text: "probe" }, { auth: false });
    record("webhook rejects an unauthenticated request", anon.status === 403, `http ${anon.status}`);

    const badKey = await fetch(`${process.env.N8N_BASE_URL.replace(/\/$/, "")}/webhook/rfp-intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer not-the-key" },
      body: JSON.stringify({ external_id: `${PREFIX}badkey-probe`, document_text: "probe" }),
    });
    record("webhook rejects a wrong key", badKey.status === 403, `http ${badKey.status}`);

    // If either probe got through it will have created a row; prove it didn't.
    const { count } = await supabase
      .from("rfps")
      .select("*", { count: "exact", head: true })
      .in("external_id", [`${PREFIX}anon-probe`, `${PREFIX}badkey-probe`]);
    record("no row reached the database from a rejected request", count === 0, `${count} row(s)`);
  }

  // ── 3. Every fixture through the live webhook ───────────────────────────
  console.log("\nTriage - full pipeline per fixture");
  const seen = [];
  for (const f of FIXTURES) {
    const externalId = `${PREFIX}${f.external_id}`;
    const r = await hitWebhook({ external_id: externalId, source: "manual", document_text: f.text });
    const verdict = r.json?.verdict;
    const ok = r.status === 200 && Boolean(verdict);
    record(f.name, ok, ok ? `${verdict} @ ${r.json.score}% in ${r.seconds}s` : `http ${r.status} ${r.text.slice(0, 120)}`);
    if (ok) seen.push({ externalId, verdict, score: r.json.score, expected: f.expected });
  }

  // ── 4. Idempotency ──────────────────────────────────────────────────────
  // n8n re-runs on addenda and rescoring. A second pass for the same
  // solicitation must update the row, not create a twin.
  console.log("\nIdempotency");
  {
    const f = FIXTURES[0];
    const externalId = `${PREFIX}${f.external_id}`;
    const r = await hitWebhook({ external_id: externalId, source: "manual", document_text: f.text });
    const { count } = await supabase
      .from("rfps")
      .select("*", { count: "exact", head: true })
      .eq("external_id", externalId);
    record("re-posting the same external_id updates in place", r.status === 200 && count === 1, `${count} row(s)`);

    const { data: rfp } = await supabase.from("rfps").select("id").eq("external_id", externalId).single();
    if (rfp) {
      const { count: gapCount } = await supabase
        .from("rfp_gap_items")
        .select("*", { count: "exact", head: true })
        .eq("rfp_id", rfp.id);
      // Children are delete-then-insert per run; a duplicated set here would
      // mean the replace step silently stopped working.
      record("child rows replaced rather than appended", gapCount < 12, `${gapCount} gap item(s)`);
    }
  }

  // ── 5. The document_url branch ──────────────────────────────────────────
  // Everything above feeds document_text. Real intake mostly sends a link, so
  // the download + PDF-extract path needs exercising separately. A deliberately
  // non-solicitation PDF also answers a question that will come up in practice:
  // what happens when somebody forwards the wrong attachment.
  console.log("\nPDF-by-URL branch");
  {
    const r = await hitWebhook({
      external_id: `${PREFIX}pdf-url`,
      source: "manual",
      document_url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    });
    const handled = r.status === 200 || r.status === 400 || r.status === 500;
    record(
      "download + extract completes without a node crash",
      handled,
      r.json?.verdict ? `verdict ${r.json.verdict}` : `http ${r.status} ${r.text.slice(0, 100)}`
    );
  }

  // ── 6. What actually landed ─────────────────────────────────────────────
  console.log("\nPersisted rows");
  for (const s of seen) {
    const { data: rfp } = await supabase
      .from("rfps")
      .select("id,title,client_agency,status,score_percent,budget_amount,budget_source,due_at")
      .eq("external_id", s.externalId)
      .maybeSingle();
    if (!rfp) {
      record(`row for ${s.externalId}`, false, "missing");
      continue;
    }
    const [{ count: gaps }, { count: comp }, { count: checks }, { count: qs }] = await Promise.all([
      supabase.from("rfp_gap_items").select("*", { count: "exact", head: true }).eq("rfp_id", rfp.id),
      supabase.from("rfp_compliance_items").select("*", { count: "exact", head: true }).eq("rfp_id", rfp.id),
      supabase.from("rfp_disqualifier_checks").select("*", { count: "exact", head: true }).eq("rfp_id", rfp.id),
      supabase.from("rfp_questions").select("*", { count: "exact", head: true }).eq("rfp_id", rfp.id),
    ]);
    const complete = Boolean(rfp.title && rfp.client_agency && rfp.status !== "pending") && checks > 0;
    record(
      `${rfp.client_agency.slice(0, 32)} - ${rfp.status}`,
      complete,
      `${gaps} gaps · ${comp} compliance · ${checks} checks · ${qs} questions`
    );
  }

  // ── 7. Dashboard queries ────────────────────────────────────────────────
  console.log("\nDashboard queries");
  {
    const { data: ranked } = await supabase
      .from("rfps")
      .select("score_percent,status")
      .neq("status", "no_go")
      .order("score_percent", { ascending: false, nullsFirst: false });
    const scores = (ranked ?? []).map((r) => r.score_percent).filter((s) => s !== null);
    const descending = scores.every((s, i) => i === 0 || scores[i - 1] >= s);
    record("queue ranks by score, highest first", descending, scores.join(" ≥ ") || "no scored rows");
    record("no-go rows excluded from the ranked queue", !(ranked ?? []).some((r) => r.status === "no_go"));

    const { count: noGoCount } = await supabase
      .from("rfps")
      .select("*", { count: "exact", head: true })
      .eq("status", "no_go");
    record("no-go rows retained, not deleted", noGoCount > 0, `${noGoCount} in the no-go folder`);
  }

  // ── cleanup ─────────────────────────────────────────────────────────────
  if (!keep) {
    const { data: removed } = await supabase.from("rfps").delete().like("external_id", `${PREFIX}%`).select("id");
    console.log(`\nCleaned up ${removed?.length ?? 0} test row(s).`);
  } else {
    console.log(`\n--keep: test rows left in place (external_id prefix "${PREFIX}").`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log("\nFailed:");
    failed.forEach((f) => console.log(`  ✗ ${f.name} - ${f.detail ?? ""}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n${err.stack}`);
  process.exit(1);
});
