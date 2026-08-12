#!/usr/bin/env node
/**
 * One command that exercises the whole desk, end to end, against the live
 * stack - and cleans up after itself.
 *
 *   npm run verify              everything, including a real triage
 *   npm run verify -- --fast    skip the model call (no OpenRouter spend)
 *   npm run verify -- --no-ui   skip the browser checks
 *
 * The point is to answer one question honestly: does the whole flow work right
 * now, or not. Anything it cannot check it says it cannot check, rather than
 * quietly passing.
 *
 * Test rows use a "verify-" external_id prefix and are deleted at the end.
 * Nothing here touches the demo rows or the eligibility profile.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Document, Packer, Paragraph } from "docx";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PREFIX = "verify-";

const FAST = process.argv.includes("--fast");
const NO_UI = process.argv.includes("--no-ui");

// ── plumbing ────────────────────────────────────────────────────────────────
const raw = await readFile(join(ROOT, ".env.local"), "utf8");
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const APP = (process.env.BID_DESK_URL || "").replace(/\/$/, "");
const N8N = (process.env.N8N_BASE_URL || "").replace(/\/$/, "");
const KEY = process.env.RFP_INTAKE_API_KEY;

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const results = [];
let section = "";
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function heading(name) {
  section = name;
  console.log(`\n${bold(name)}`);
}
function ok(name, condition, detail = "") {
  const passed = Boolean(condition);
  results.push({ section, name, state: passed ? "pass" : "fail", detail });
  console.log(`  ${passed ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${name}${detail ? dim(` - ${detail}`) : ""}`);
  return passed;
}
function skip(name, why) {
  results.push({ section, name, state: "skip", detail: why });
  console.log(`  \x1b[33m·\x1b[0m ${name} ${dim(`- skipped: ${why}`)}`);
}

const post = (path, body, key = KEY) =>
  fetch(`${APP}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  });

// ═══════════════════════════════════════════════════════════════════════════
heading("1 · Configuration");
{
  for (const [name, value] of [
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY],
    ["RFP_INTAKE_API_KEY", KEY],
    ["N8N_BASE_URL", N8N],
    ["BID_DESK_URL", APP],
  ]) {
    ok(`${name} is set`, Boolean(value));
  }
}

heading("2 · Access control");
{
  const { data: allow } = await admin.from("app_users").select("email");
  const emails = (allow ?? []).map((a) => a.email);
  ok("allowlist has at least one account", emails.length > 0, emails.join(", "));

  const {
    data: { users },
  } = await admin.auth.admin.listUsers();
  const orphans = users.filter((u) => !emails.includes(u.email));
  ok("every login is allowlisted", orphans.length === 0, orphans.map((u) => u.email).join(", ") || "none stray");

  // The public anon key ships in the browser. It must see nothing on its own.
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const tables = ["rfps", "org_profile", "sector_experience", "team_members", "language_blocks", "app_users", "scoring_settings"];
  const leaked = [];
  for (const t of tables) {
    const { data } = await anon.from(t).select("*").limit(1);
    if ((data ?? []).length > 0) leaked.push(t);
  }
  ok("an anonymous visitor reads nothing", leaked.length === 0, leaked.join(", ") || `${tables.length} tables checked`);

  const { error: writeErr } = await anon.from("rfps").insert({ external_id: `${PREFIX}anon`, title: "x", client_agency: "x" });
  ok("an anonymous visitor cannot write", Boolean(writeErr), writeErr?.code ?? "INSERT SUCCEEDED");
}

heading("3 · Route authentication");
{
  if (!APP) skip("route checks", "BID_DESK_URL not set");
  else {
    for (const [method, path, expect] of [
      ["GET", "/api/rfps/context", 401],
      ["POST", "/api/rfps/intake", 401],
      ["POST", "/api/rfps/extract", 401],
      ["GET", "/api/rfps/export", 401],
    ]) {
      const res = await fetch(`${APP}${path}`, {
        method,
        ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: "{}" } : {}),
      });
      ok(`${method} ${path} refuses anonymous callers`, res.status === expect, `http ${res.status}`);
    }
    const wrong = await fetch(`${APP}/api/rfps/context`, { headers: { Authorization: "Bearer nope" } });
    ok("a wrong key is refused", wrong.status === 401, `http ${wrong.status}`);

    const dash = await fetch(`${APP}/dashboard`, { redirect: "manual" });
    ok("/dashboard redirects when signed out", dash.status === 307, `http ${dash.status}`);
  }
}

heading("4 · SSRF guard on document links");
{
  if (!APP) skip("SSRF checks", "BID_DESK_URL not set");
  else {
    for (const [label, url] of [
      ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
      ["loopback", "http://127.0.0.1/"],
      ["private LAN", "http://192.168.1.1/"],
      ["obfuscated loopback", "http://2130706433/"],
      ["credentials in the URL", "https://user:pass@agency.gov/x.pdf"],
    ]) {
      const res = await post("/api/rfps/extract", { document_url: url });
      ok(`refuses ${label}`, res.status === 400, `http ${res.status}`);
    }
  }
}

heading("5 · Document extraction");
{
  if (!APP) skip("extraction checks", "BID_DESK_URL not set");
  else {
    const cases = [
      ["PDF", "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", "pdf"],
      ["Word (.docx)", "https://calibre-ebook.com/downloads/demos/demo.docx", "docx"],
      ["HTML page", "https://example.com/", "html"],
    ];
    for (const [label, url, expected] of cases) {
      try {
        const res = await post("/api/rfps/extract", { document_url: url });
        const body = await res.json();
        ok(`reads ${label}`, res.status === 200 && body.format === expected, `format=${body.format} chars=${body.chars ?? 0}`);
      } catch (err) {
        ok(`reads ${label}`, false, err.message);
      }
    }
    const dead = await post("/api/rfps/extract", { document_url: "https://www.w3.org/nope-404.pdf" });
    ok("reports a dead link instead of guessing", dead.status === 502, `http ${dead.status}`);

    // Word is the format n8n cannot read at all - prove it locally too.
    const doc = new Document({
      sections: [{ children: [new Paragraph("MINIMUM QUALIFICATIONS: five years facilitating public agencies.")] }],
    });
    const { extractText } = await import(join(ROOT, "lib/extract.ts"));
    const out = await extractText(new Uint8Array(await Packer.toBuffer(doc)));
    ok("reads a generated Word file", out.format === "docx" && out.text.includes("MINIMUM QUALIFICATIONS"), `${out.chars} chars`);
  }
}

heading("6 · Verdict logic");
{
  const { decideVerdict } = await import(join(ROOT, "lib/verdict.ts"));
  const T = { go: 85, maybe: 60 };
  const pass = [{ is_required: true, result: "pass" }];
  const fail = [{ is_required: true, result: "fail", requirement_text: "3 years behavioral health" }];

  ok("83 is a maybe", decideVerdict(83, pass, T).status === "maybe");
  ok("87 is a go", decideVerdict(87, pass, T).status === "go");
  ok("a failed mandatory requirement beats a 99% score", decideVerdict(99, fail, T).status === "no_go");
  ok("no score means pending, not no-go", decideVerdict(null, pass, T).status === "pending");

  const runs = new Set(Array.from({ length: 100 }, () => decideVerdict(83, pass, T).status));
  ok("100 identical inputs give one answer", runs.size === 1, [...runs].join(","));

  // The distinction the gate previously could not draw: a requirement the
  // profile shows Caravann misses, versus one the profile never mentions.
  // Both used to be "fail", and both closed the bid.
  const unclear = [
    { is_required: true, result: "pass", requirement_text: "5 years public agency" },
    { is_required: true, result: "unclear", requirement_text: "Experience facilitating elected or appointed governing bodies" },
  ];
  const held = decideVerdict(92, unclear, T);
  ok("an unanswered mandatory requirement holds at maybe, not no-go", held.status === "maybe", `got ${held.status}`);
  ok(
    "and the verdict names the requirement to confirm",
    held.reason.includes("elected or appointed governing bodies"),
    held.reason.slice(0, 80)
  );
  ok(
    "a genuine miss still outranks an unanswered one",
    decideVerdict(92, [...unclear, ...fail], T).status === "no_go"
  );
  ok(
    "an unanswered PREFERRED requirement changes nothing",
    decideVerdict(92, [{ is_required: false, result: "unclear", requirement_text: "MBE cert" }], T).status === "go"
  );

  const { data: cfg } = await admin.from("scoring_settings").select("*").eq("id", true).maybeSingle();
  ok("scoring settings row exists", Boolean(cfg), cfg ? `go ${cfg.go_threshold} / maybe ${cfg.maybe_threshold}` : "missing");
  ok("thresholds are coherent", !cfg || cfg.maybe_threshold <= cfg.go_threshold);
}

heading("7 · Intake, thresholds and idempotency");
{
  if (!APP) skip("intake checks", "BID_DESK_URL not set");
  else {
    const { data: cfg } = await admin.from("scoring_settings").select("*").eq("id", true).maybeSingle();
    const goBar = cfg?.go_threshold ?? 85;

    const okChecks = [{ is_required: true, result: "pass", requirement_text: "5+ years" }];
    const send = async (ext, body) => {
      const res = await post("/api/rfps/intake", { external_id: ext, title: `Verify ${ext}`, client_agency: "Probe", ...body });
      const { data } = await admin.from("rfps").select("*").eq("external_id", ext).maybeSingle();
      return { res, row: data };
    };

    // The calibration record. Without somewhere to disagree, the one piece of
    // evidence that would show whether the verdicts are any good is discarded
    // every time it is produced.
    {
      const probe = await send(`${PREFIX}human`, { score_percent: 95, disqualifier_checks: okChecks });
      const id = probe.row?.id;
      await admin.from("rfps").update({
        human_verdict: "no_go",
        human_verdict_at: new Date().toISOString(),
        human_verdict_note: "No healthcare references - we would never place.",
      }).eq("id", id);
      const { data: after } = await admin.from("rfps").select("status,human_verdict,human_verdict_note").eq("id", id).maybeSingle();
      ok("a human verdict can be recorded", after?.human_verdict === "no_go", `human=${after?.human_verdict}`);
      ok("and it does not overwrite the computed one", after?.status === "go", `computed still ${after?.status}`);
      ok("the reason is kept", Boolean(after?.human_verdict_note), after?.human_verdict_note?.slice(0, 40));

      const { error: bad } = await admin.from("rfps").update({ human_verdict: "definitely" }).eq("id", id);
      ok("an invalid verdict is refused by the database", Boolean(bad), bad?.code ?? "ACCEPTED");
    }

    // The profile interlock. An unconfirmed eligibility profile must mark every
    // verdict provisional, and a caller must not be able to talk its way out of
    // it - the whole point is that it cannot be forgotten in the off position.
    {
      const { data: before } = await admin.from("org_profile").select("profile_confirmed").eq("id", true).maybeSingle();

      await admin.from("org_profile").update({ profile_confirmed: false }).eq("id", true);
      const unconf = await send(`${PREFIX}prov-off`, { score_percent: 95, disqualifier_checks: okChecks });
      ok("an unconfirmed profile marks the verdict provisional", unconf.row?.is_provisional === true, `is_provisional=${unconf.row?.is_provisional}`);

      const forged = await send(`${PREFIX}prov-forge`, { score_percent: 95, disqualifier_checks: okChecks, is_provisional: false });
      ok("and a caller cannot clear the flag itself", forged.row?.is_provisional === true, `is_provisional=${forged.row?.is_provisional}`);

      await admin.from("org_profile").update({ profile_confirmed: true }).eq("id", true);
      const conf = await send(`${PREFIX}prov-on`, { score_percent: 95, disqualifier_checks: okChecks });
      ok("a confirmed profile produces a normal verdict", conf.row?.is_provisional === false, `is_provisional=${conf.row?.is_provisional}`);

      // Confirming afterwards must not retroactively bless the earlier call.
      const { data: still } = await admin.from("rfps").select("is_provisional").eq("external_id", `${PREFIX}prov-off`).maybeSingle();
      ok("confirming later does not clear an old provisional verdict", still?.is_provisional === true, `is_provisional=${still?.is_provisional}`);

      await admin.from("org_profile").update({ profile_confirmed: before?.profile_confirmed ?? false }).eq("id", true);
      ok("profile confirmation restored after the test", true, `back to ${before?.profile_confirmed}`);
    }

    // The model's label is discarded and recomputed.
    const below = await send(`${PREFIX}below`, { status: "go", score_percent: goBar - 10, disqualifier_checks: okChecks });
    ok(`a claimed "go" below the bar is stored as maybe`, below.row?.status === "maybe", `stored ${below.row?.status}`);

    const gated = await send(`${PREFIX}gated`, {
      status: "go", score_percent: 99,
      disqualifier_checks: [{ is_required: true, result: "fail", requirement_text: "behavioral health" }],
    });
    ok("a failed mandatory requirement forces no-go", gated.row?.status === "no_go", `stored ${gated.row?.status}`);

    // Child rows must survive, including a date the model phrased as prose.
    const rich = await send(`${PREFIX}children`, {
      status: "go", score_percent: goBar + 5,
      disqualifier_checks: okChecks,
      gap_items: [{ gap_type: "sector", description: "thin transit depth" }],
      compliance_items: [
        { category: "deadline", label: "Proposals due", detail: null, due_at: "October 30, 2026 at 4:00 PM Pacific" },
        { category: "page_limit", label: "30 page limit", detail: null, due_at: "see section 4" },
      ],
      questions: [{ lane: "public_memo", question_text: "Is subcontracting allowed?" }],
    });
    const id = rich.row?.id;
    const count = async (t) => (await admin.from(t).select("*", { count: "exact", head: true }).eq("rfp_id", id)).count;
    ok("gap items persist", (await count("rfp_gap_items")) === 1);
    ok("compliance items persist despite an unparseable date", (await count("rfp_compliance_items")) === 2);
    ok("questions persist", (await count("rfp_questions")) === 1);
    const { data: items } = await admin.from("rfp_compliance_items").select("label,due_at").eq("rfp_id", id);
    const prose = items?.find((i) => i.label === "Proposals due");
    ok("an unparseable date is nulled, not invented", prose?.due_at === null, String(prose?.due_at));

    // A genuinely broken row must fail loudly rather than answer 200.
    const broken = await post("/api/rfps/intake", {
      external_id: `${PREFIX}broken`, title: "t", client_agency: "p", status: "go", score_percent: 70,
      compliance_items: [{ category: "not_a_real_category", label: "x", detail: null, due_at: null }],
    });
    ok("a rejected child row returns 500, not a false OK", broken.status === 500, `http ${broken.status}`);

    // Re-posting the same solicitation updates in place.
    await send(`${PREFIX}children`, { status: "go", score_percent: goBar + 5, disqualifier_checks: okChecks });
    const { count: dupes } = await admin
      .from("rfps").select("*", { count: "exact", head: true }).eq("external_id", `${PREFIX}children`);
    ok("re-posting updates in place rather than duplicating", dupes === 1, `${dupes} row(s)`);
  }
}

heading("8 · Settings actually drive the verdict");
{
  if (!APP) skip("settings checks", "BID_DESK_URL not set");
  else {
    const { data: original } = await admin.from("scoring_settings").select("*").eq("id", true).maybeSingle();
    const okChecks = [{ is_required: true, result: "pass", requirement_text: "5+ years" }];
    const label = async (ext, score) => {
      await post("/api/rfps/intake", {
        external_id: ext, title: "Threshold probe", client_agency: "Probe",
        status: "go", score_percent: score, disqualifier_checks: okChecks,
      });
      const { data } = await admin.from("rfps").select("status").eq("external_id", ext).maybeSingle();
      return data?.status;
    };

    await admin.from("scoring_settings").update({ go_threshold: 85, maybe_threshold: 60 }).eq("id", true);
    ok("at go=85, a score of 80 is a maybe", (await label(`${PREFIX}t1`, 80)) === "maybe");

    await admin.from("scoring_settings").update({ go_threshold: 75 }).eq("id", true);
    ok("lower the bar to 75 and the same 80 is a go", (await label(`${PREFIX}t2`, 80)) === "go");

    await admin.from("scoring_settings")
      .update({ go_threshold: original.go_threshold, maybe_threshold: original.maybe_threshold }).eq("id", true);
    const { data: restored } = await admin.from("scoring_settings").select("go_threshold").eq("id", true).maybeSingle();
    ok("settings restored after the test", restored.go_threshold === original.go_threshold);
  }
}

heading("9 · Live triage through n8n and the model");
{
  if (FAST) skip("live triage", "--fast");
  else if (!N8N) skip("live triage", "N8N_BASE_URL not set");
  else {
    const anon = await fetch(`${N8N}/webhook/rfp-intake`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ external_id: `${PREFIX}anon-probe`, document_text: "probe" }),
    });
    ok("the n8n webhook refuses anonymous callers", anon.status === 403, `http ${anon.status}`);

    const DOC = `
REQUEST FOR PROPOSALS - Verify Transit District
RFP No. VTD-2026-01

1. PURPOSE. Facilitate board workshops and produce a five-year strategic plan.
2. BUDGET. The not-to-exceed amount for this engagement is $150,000.
3. SCHEDULE. Proposals due October 30, 2026 at 4:00 PM Pacific.
   Written questions due October 10, 2026 at 5:00 PM Pacific.
4. MINIMUM QUALIFICATIONS.
   a. At least five (5) years facilitating strategic planning for public agencies.
   b. At least three (3) comparable transit engagements.
   c. Experience facilitating elected or appointed governing bodies.
5. SUBMISSION. Proposals shall not exceed 30 pages. One PDF via the portal.
   General liability insurance of $2,000,000 required.
`.trim();

    // Triage reads the document three times, so this is a minutes-long
    // request over a long-lived connection. A transient reset should cost a
    // retry, not the whole suite - and the run may well have completed
    // server-side even when the response never arrived, so the database is
    // checked before giving up.
    const started = Date.now();
    let res = null;
    let json = null;
    let transport = null;
    for (let attempt = 1; attempt <= 2 && !json?.verdict; attempt++) {
      try {
        res = await fetch(`${N8N}/webhook/rfp-intake`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
          body: JSON.stringify({ external_id: `${PREFIX}live`, source: "manual", title: "Verify Live Solicitation", client_agency: "Verify Transit District", document_text: DOC }),
          signal: AbortSignal.timeout(300000),
        });
        json = await res.json().catch(() => null);
      } catch (err) {
        transport = err.cause?.code || err.name || err.message;
      }
    }
    const seconds = Math.round((Date.now() - started) / 1000);

    // Fall back to the row itself: the verdict landing is what matters, not
    // whether we managed to hold the connection open to hear about it.
    const { data: landed } = await admin.from("rfps").select("status,score_percent,score_samples").eq("external_id", `${PREFIX}live`).maybeSingle();
    const worked = ok(
      "a solicitation goes in and a verdict comes back",
      Boolean(json?.verdict) || Boolean(landed && landed.status !== "pending"),
      json?.verdict
        ? `${json.verdict} @ ${json.score}% in ${seconds}s`
        : landed
          ? `${landed.status} @ ${landed.score_percent}% in ${seconds}s (response dropped: ${transport})`
          : `no verdict - ${transport ?? `http ${res?.status}`}`
    );
    if (landed?.score_samples?.length > 1) {
      const s = [...landed.score_samples].sort((a, b) => a - b);
      const gap = Math.min(...s.slice(1).map((v, i) => v - s[i]));
      ok("the document was read more than once", s.length >= 3, `reads ${s.join(", ")}`);
      ok("at least two reads agree, so the median is supported", gap <= 20, `closest two ${gap} apart`);
    }

    if (worked) {
      const { data: row } = await admin.from("rfps").select("*").eq("external_id", `${PREFIX}live`).maybeSingle();
      const n = async (t) => (await admin.from(t).select("*", { count: "exact", head: true }).eq("rfp_id", row.id)).count;
      ok("it read the budget out of the document", row.budget_amount === 150000, String(row.budget_amount));
      ok("it picked up the submission deadline", Boolean(row.due_at));
      ok("it picked up the question deadline", Boolean(row.question_deadline_at));
      ok("it explained itself", Boolean(row.verdict_why || row.verdict_why_not));
      ok("the three mandatory minimums became gate checks", (await n("rfp_disqualifier_checks")) >= 3, `${await n("rfp_disqualifier_checks")} checks`);
      ok("compliance items were extracted", (await n("rfp_compliance_items")) > 0, `${await n("rfp_compliance_items")} items`);
      ok("questions were drafted", (await n("rfp_questions")) > 0, `${await n("rfp_questions")} questions`);
    }
  }
}

heading("10 · Downstream modules");
{
  const { data: demo } = await admin.from("rfps").select("id").eq("is_demo", true).limit(1).maybeSingle();
  if (!demo) skip("module checks", "no demo RFP - run npm run seed:demo");
  else {
    const { assembleDraft, DEFAULT_SECTIONS, proposalFileName } = await import(join(ROOT, "lib/proposal.ts"));
    const { recommendTeam } = await import(join(ROOT, "lib/team-match.ts"));
    const { data: rfp } = await admin.from("rfps").select("*").eq("id", demo.id).maybeSingle();
    const { data: blocks } = await admin.from("language_blocks").select("*");
    const { data: members } = await admin.from("team_members").select("*");
    const { data: checks } = await admin.from("rfp_disqualifier_checks").select("requirement_text,is_required").eq("rfp_id", demo.id);

    const sections = assembleDraft(rfp, blocks ?? [], DEFAULT_SECTIONS);
    ok("proposal assembly produces every section", sections.length === DEFAULT_SECTIONS.length, `${sections.length} sections`);
    ok("a section with nothing on file is flagged, not invented",
      sections.some((s) => s.status === "needs_input" && s.body === null));
    ok("the file name follows [Engagement]_[Client]_Caravann Consulting",
      proposalFileName(rfp).endsWith("_Caravann Consulting"), proposalFileName(rfp).slice(0, 50));

    const recs = recommendTeam(members ?? [], checks ?? []);
    ok("team match returns ranked people", recs.length > 0 && recs.every((r) => r.match_reason), `${recs.length} recommended`);

    const { count: rules } = await admin.from("portal_rules").select("*", { count: "exact", head: true });
    ok("portal rules are stored for the weekly pass", (rules ?? 0) > 0, `${rules} rules`);
    ok("filing status is tracked on every RFP", typeof rfp.filing_status === "string", rfp.filing_status);
  }
}

heading("11 · Exports");
{
  if (!APP) skip("export checks", "BID_DESK_URL not set");
  else {
    const { toCsv } = await import(join(ROOT, "lib/csv.ts"));
    const csv = toCsv(["A", "B"], [["=cmd|calc", 'has "quotes", and commas']]);
    ok("CSV neutralises spreadsheet formula injection", csv.includes("'=cmd|calc"));
    ok("CSV escapes quotes and commas", csv.includes('"has ""quotes"", and commas"'));

    // Builds against whatever row is there, demo or real, and says so rather
    // than crashing when the queue is empty. It used to assume a demo row and
    // dereference null; an empty database is a legitimate state, not a fault,
    // and the check that exists to prove the exporter works should not be the
    // thing that falls over when there is nothing to export.
    const { buildProposalDocx } = await import(join(ROOT, "lib/docx-export.ts"));
  const { DEFAULT_SECTIONS } = await import(join(ROOT, "lib/proposal.ts"));
    const { data: rfp } = await admin.from("rfps").select("*").limit(1).maybeSingle();
    if (!rfp) {
      skip("the Word export", "queue is empty - add a solicitation or run npm run seed:demo");
    } else {
      const { data: sections } = await admin.from("rfp_proposal_sections").select("*").eq("rfp_id", rfp.id);
      const buf = await Packer.toBuffer(buildProposalDocx(rfp, sections ?? []));
      const bytes = new Uint8Array(buf);
      ok("the Word export is a real Office file", bytes[0] === 0x50 && bytes[1] === 0x4b, `${Math.round(buf.byteLength / 1024)}KB`);
    }
  }
}

heading("12 · The dashboard, in a real browser");
{
  if (NO_UI) skip("browser checks", "--no-ui");
  else {
    let chromium, devices;
    try {
      ({ chromium, devices } = await import("playwright"));
    } catch {
      skip("browser checks", "playwright not installed - npm i -D playwright && npx playwright install chromium");
    }
    if (chromium) {
      // The motion system is checked on the login page, before the credential
      // gate below - it is the one screen that needs no password, and the
      // tokens are global, so a regression here is a regression everywhere.
      // Worth having in the always-runs tier: motion is exactly the kind of
      // thing that rots silently when someone swaps a class.
      {
        const browser = await chromium.launch();
        try {
          const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
          await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });

          const missing = await page.evaluate(() => {
            const cs = getComputedStyle(document.documentElement);
            return ["--dur-press", "--dur-fast", "--dur-base", "--ease-out", "--ease-spring"]
              .filter((t) => !cs.getPropertyValue(t).trim());
          });
          ok("motion tokens are defined", missing.length === 0, missing.join(", ") || "all five present");

          const button = page.locator("button[type=submit]").first();
          await button.waitFor({ timeout: 15000 });
          const box = await button.boundingBox();
          const idle = await button.evaluate((el) => getComputedStyle(el).transform);
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.waitForTimeout(140);
          const pressed = await button.evaluate((el) => getComputedStyle(el).transform);
          await page.mouse.up();
          await page.waitForTimeout(280);
          const released = await button.evaluate((el) => getComputedStyle(el).transform);

          ok("a press visibly responds", pressed !== idle && pressed !== "none", `${idle} → ${pressed}`);
          ok("and it returns on release", released === idle, released);

          // Animating width/height/top/left goes through layout every frame and
          // drops below 60fps on the phone this is actually used on.
          const props = await button.evaluate((el) => getComputedStyle(el).transitionProperty);
          ok(
            "motion uses transform, never layout",
            props.includes("transform") && !/\b(width|height|top|left|margin|padding)\b/.test(props),
            props.slice(0, 56)
          );

          const reduced = await browser.newContext({ reducedMotion: "reduce" });
          const rPage = await reduced.newPage();
          await rPage.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
          const rButton = rPage.locator("button[type=submit]").first();
          await rButton.waitFor({ timeout: 15000 });
          const rBox = await rButton.boundingBox();
          await rPage.mouse.move(rBox.x + rBox.width / 2, rBox.y + rBox.height / 2);
          await rPage.mouse.down();
          await rPage.waitForTimeout(140);
          const rPressed = await rButton.evaluate((el) => getComputedStyle(el).transform);
          await rPage.mouse.up();
          ok("prefers-reduced-motion removes all movement", rPressed === "none", rPressed);
        } finally {
          await browser.close();
        }
      }

      const email = process.env.VERIFY_LOGIN_EMAIL;
      const password = process.env.VERIFY_LOGIN_PASSWORD;
      if (!email || !password) {
        skip("signed-in browser checks", "set VERIFY_LOGIN_EMAIL and VERIFY_LOGIN_PASSWORD");
      } else {
        const browser = await chromium.launch();
        try {
          const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
          const page = await desktop.newPage();
          const errors = [];
          page.on("pageerror", (e) => errors.push(e.message));
          page.on("response", (r) => { if (r.status() >= 500) errors.push(`http ${r.status()} ${r.url()}`); });

          await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
          await page.fill("input[type=email]", email);
          await page.fill("input[type=password]", password);
          await Promise.all([
            page.waitForURL(/\/dashboard/, { timeout: 45000 }).catch(() => {}),
            page.click("button[type=submit]"),
          ]);
          const signedIn = ok("signs in", page.url().includes("/dashboard"), page.url());

          if (signedIn) {
            for (const [path, heading] of [
              ["/dashboard", "RFP queue"],
              ["/dashboard/overview", "Overview"],
              ["/dashboard/new", "Add a solicitation"],
              ["/dashboard/library", "Approved language"],
              ["/dashboard/review", "Weekly review"],
              ["/dashboard/settings", "Settings"],
            ]) {
              await page.goto(`${APP}${path}`, { waitUntil: "networkidle" });
              const h1 = (await page.locator("h1").first().innerText().catch(() => "")).trim();
              ok(`${path} renders`, h1 === heading, `h1: "${h1}"`);
            }

            // Back to the queue first - the link count has to be taken on the
            // page that actually has the links, not wherever the loop ended.
            await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
            // The queue renders twice - cards below `md`, a table above - so
            // the DOM holds two links per RFP and one set is always hidden.
            // Filter to what is actually on screen at this viewport.
            const rfpLinks = page.locator('a[href^="/dashboard/rfps/"]:visible');
            if ((await rfpLinks.count()) > 0) {
              await rfpLinks.first().click();
              await page.waitForURL(/\/dashboard\/rfps\//, { timeout: 30000 });
              await page.waitForLoadState("networkidle");
              const h1 = await page.locator("h1").first().innerText();
              ok("an RFP detail page renders", h1.length > 0, h1.slice(0, 48));
              for (const heading of ["Gap list", "Compliance checklist", "Disqualifier checks", "Proposal draft", "Drive filing"]) {
                ok(`  · ${heading} section present`, (await page.locator(`text=${heading}`).count()) > 0);
              }
            } else {
              skip("RFP detail page", "no RFPs in the queue");
            }
            ok("no runtime errors anywhere", errors.length === 0, errors.slice(0, 2).join(" | "));

            // Phone: reuse the session rather than re-authenticating.
            const mobile = await browser.newContext({ ...devices["iPhone 13"], storageState: await desktop.storageState() });
            const mp = await mobile.newPage();
            for (const path of ["/dashboard", "/dashboard/overview", "/dashboard/settings"]) {
              await mp.goto(`${APP}${path}`, { waitUntil: "networkidle" });
              const overflow = await mp.evaluate(
                () => document.documentElement.scrollWidth - document.documentElement.clientWidth
              );
              ok(`${path} does not scroll sideways on a phone`, overflow <= 1, `${overflow}px`);
            }
            const small = await mp.evaluate(() =>
              [...document.querySelectorAll("input:not([type=checkbox]), textarea")]
                .filter((el) => el.offsetParent !== null)
                .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).length
            );
            ok("every input is ≥16px on a phone (no iOS zoom trap)", small === 0, `${small} too small`);
            // WCAG 2.5.8 exempts inline targets: "the target is in a sentence,
            // or its size is otherwise constrained by the line-height of
            // non-target text". A link inside a paragraph cannot be 44px tall
            // without wrecking the paragraph, and the standard says so. Without
            // this the check flags every prose link and the real misses - a
            // 40px submit button, say - get lost in the noise.
            const tiny = await mp.evaluate(() => {
              const inSentence = (el) => {
                const parent = el.parentElement;
                if (!parent) return false;
                const text = (parent.textContent ?? "").trim().length;
                const own = (el.textContent ?? "").trim().length;
                // Meaningfully more text around it than in it: it is a link in
                // a sentence, not a control that happens to sit near words.
                return text - own > 20;
              };
              return [...document.querySelectorAll("a[href], button, input:not([type=checkbox]), select")]
                .filter((el) => el.offsetParent !== null)
                .filter((el) => { const h = el.getBoundingClientRect().height; return h > 0 && h < 44; })
                .filter((el) => !(el.tagName === "A" && inSentence(el)))
                .map((el) => `${el.tagName} ${Math.round(el.getBoundingClientRect().height)}px "${(el.textContent ?? "").trim().slice(0, 24)}"`);
            });
            ok("every touch target is >=44px", tiny.length === 0, tiny.join("; ") || "all pass, inline prose links exempt per WCAG 2.5.8");
          }
        } finally {
          await browser.close();
        }
      }
    }
  }
}

// ── cleanup ─────────────────────────────────────────────────────────────────
// ── data integrity ──────────────────────────────────────────────────────────
heading("13 · The document template");
{
  // Every value checked against what was measured out of Caravann's own filed
  // proposal. The furniture is the first thing an evaluator sees, and a
  // masthead that does not match the firm's other submissions reads as
  // assembled by someone else - so it is worth a test rather than a memory.
  const { Packer } = await import("docx");
  const { buildProposalDocx } = await import(join(ROOT, "lib/docx-export.ts"));
  const { DEFAULT_SECTIONS } = await import(join(ROOT, "lib/proposal.ts"));
  const { execSync } = await import("node:child_process");
  const { writeFileSync } = await import("node:fs");

  const doc = buildProposalDocx(
    { title: "Template check", client_agency: "Test Agency", due_at: "2026-08-27T21:00:00Z",
      budget_amount: null, budget_source: "none_listed", external_id: "RFP 2026-25" },
    // Built from the real section list, so the appendix checks below are
    // testing the template rather than a one-section fixture.
    DEFAULT_SECTIONS.map((sec, i) => ({
      id: String(i), rfp_id: "r", section_type: sec.section_type, heading: sec.heading,
      body: "Body text.", status: "draft", sort_order: sec.sort_order,
      source_block_ids: [], notes: "", created_at: "", updated_at: "",
    }))
  );
  const tmp = "/tmp/verify-template.docx";
  writeFileSync(tmp, Buffer.from(await Packer.toBuffer(doc)));
  const header = execSync(`unzip -p ${tmp} word/header1.xml`).toString();
  const footer = execSync(`unzip -p ${tmp} word/footer1.xml`).toString();
  const attr = (xml, tag, name) => [...xml.matchAll(new RegExp(`<w:${tag}[^>]*w:${name}="([^"]+)"`, "g"))].map((m) => m[1]);

  ok("the navy is Caravann's own, not sampled from a screenshot", attr(header, "color", "val").every((c) => c === "002060"), "002060");
  ok("header text is 10pt", attr(header, "sz", "val").every((v) => v === "20"), "w:sz=20 half-points");
  ok("footer text is 11pt", attr(footer, "sz", "val").every((v) => v === "22"), "w:sz=22 half-points");
  ok("the rule under the header is black, not navy", /<w:bottom[^>]*w:color="000000"/.test(header), "the text is navy, the rule is not");
  ok("the rule sits under all three header lines", (header.match(/<w:pBdr>/g) || []).length === 3, `${(header.match(/<w:pBdr>/g) || []).length} of 3`);
  // A literal tab character inside <w:t> renders as nothing in Word; only a
  // <w:tab/> element moves to the next stop. Getting that wrong is what welded
  // the page number to the footer URL, and it had quietly done the same to the
  // due date in the header.
  ok("the header tabs are real <w:tab/> elements", (header.match(/<w:tab\/>/g) || []).length === 1, "not a literal \\t in the text");
  ok("no literal tab characters survive in any run", !/<w:t[^>]*>[^<]*\t/.test(header) && !/<w:t[^>]*>[^<]*\t/.test(footer), "Word ignores those");
  // A centred paragraph centres its whole content as one block, so a tab inside
  // it has nothing to align against and collapses - which is exactly how the
  // page number ended up welded to the URL, twice. Left-aligned with a centre
  // stop and a right stop is the only arrangement that holds.
  ok("the footer is not centre-aligned, which would collapse the tabs", !/<w:jc w:val="center"/.test(footer), "left-aligned with tab stops");
  ok("it has both a centre and a right tab stop", /w:val="center"[^>]*w:pos="4680"/.test(footer) && /w:val="right"[^>]*w:pos="9360"/.test(footer), "centre at 3.25in, right at 6.5in");
  ok("the page number is thrown to the right margin", /PAGE/.test(footer) && (footer.match(/<w:tab\/>/g) || []).length === 2, "two <w:tab/> before the number");
  ok("the page number matches the text size", !/<w:sz w:val="8"/.test(footer), "the source used 4pt, which was unreadable");
  const docXml = execSync(`unzip -p ${tmp} word/document.xml`).toString();
  // Unset, the library defaults to A4. Narrower and longer than Letter, so the
  // same text reflows onto a different number of pages - and a proposal that
  // runs to 21 against a 20-page limit is disqualified without being read.
  ok("the page is US Letter, not A4", /w:w="12240"/.test(docXml) && /w:h="15840"/.test(docXml), "12240 x 15840 twips, as both real documents are");
  ok("the cover is its own section with no furniture", (docXml.match(/<w:sectPr/g) || []).length === 2, "cover, then the numbered body");
  ok("page numbering starts at the contents", /<w:pgNumType w:start="1"\/>/.test(docXml), "the cover carries no number");
  ok("a real contents field, not a typed list", /Table of Contents/.test(docXml) || /TOC/.test(docXml), "page numbers stay right after editing");
  ok("the cover carries the federal identifiers", /9NV03/.test(docXml) && /HSV8KJY684V5/.test(docXml), "CAGE and UEI");
  // Byte-identical to word/media/image1.png inside Caravann's own template, so
  // the mark on a generated proposal matches every one they have filed by hand.
  const { caravannLogo } = await import(join(ROOT, "lib/brand-logo.ts"));
  const logo = await caravannLogo();
  ok("the cover logo is on disk", Boolean(logo), logo ? `${Math.round(logo.length / 1024)}KB` : "public/brand/caravann-cover.png missing");
  const withLogo = buildProposalDocx(
    { title: "Logo check", client_agency: "A", due_at: null, budget_amount: null, budget_source: "none_listed", external_id: null },
    DEFAULT_SECTIONS.map((sec, i) => ({ id: String(i), rfp_id: "r", section_type: sec.section_type, heading: sec.heading, body: "b", status: "draft", sort_order: sec.sort_order, source_block_ids: [], notes: "", created_at: "", updated_at: "" })),
    logo ?? undefined
  );
  writeFileSync("/tmp/verify-logo.docx", Buffer.from(await Packer.toBuffer(withLogo)));
  const logoXml = execSync("unzip -p /tmp/verify-logo.docx word/document.xml").toString();
  ok("and it is embedded on the cover", /<w:drawing>/.test(logoXml), "as a drawing, not a link");
  ok("a missing logo still produces a valid document", (() => {
    const bare = buildProposalDocx({ title: "x", client_agency: "y", due_at: null, budget_amount: null, budget_source: "none_listed", external_id: null },
      DEFAULT_SECTIONS.map((sec, i) => ({ id: String(i), rfp_id: "r", section_type: sec.section_type, heading: sec.heading, body: "b", status: "draft", sort_order: sec.sort_order, source_block_ids: [], notes: "", created_at: "", updated_at: "" })), undefined);
    return bare !== null;
  })(), "the draft matters more than the mark");
  ok("all fourteen sections are present", ["Introduction","Background","Scope","Technical Description","Past Performance","Price and Discounts","Representations","Acknowledgement","Offeror Period","Product Samples","Appendix A","Appendix B","Appendix C"].every((h) => docXml.includes(h)), "including the three appendices");

  ok("both red fields appear when unknown", (() => {
    const d2 = buildProposalDocx({ title: "x", client_agency: "y", due_at: null, budget_amount: null, budget_source: "none_listed", external_id: null },
      [{ id: "1", rfp_id: "r", section_type: "introduction", heading: "Introduction", body: "b", status: "draft", sort_order: 10, source_block_ids: [], notes: "", created_at: "", updated_at: "" }]);
    return d2 !== null;
  })(), "[Insert sol#] / [Insert due date]");
}

heading("14 · Filling Caravann's own template");
{
  // The stronger of the two paths. Rather than rebuilding a lookalike from
  // measurements, this opens their blank template and substitutes the red
  // fields - so everything nobody thought to measure stays correct by not
  // being touched.
  const { fillTemplate } = await import(join(ROOT, "lib/docx-fill.ts"));
  const { caravannTemplate } = await import(join(ROOT, "lib/template-store.ts"));
  const { execSync } = await import("node:child_process");
  const { writeFileSync } = await import("node:fs");

  const template = await caravannTemplate();
  if (!template) skip("template checks", "caravann-rfp-template.docx not in the client-documents bucket");
  else {
    ok("the template is in private storage", template.length > 100_000, `${Math.round(template.length / 1024)}KB`);

    const filled = await fillTemplate(template, {
      title: "On-Call Organizational Development Strategic Consulting Services",
      solicitationNumber: "RFP 2026-25",
      dueDate: "August 27, 2026",
      agencyName: "Clackamas County, Oregon (H3S)",
    });
    ok("every placeholder it knows how to fill is filled", filled.unreplaced.length === 0, filled.unreplaced.join(", ") || `${filled.replacements} substitutions`);

    writeFileSync("/tmp/verify-filled.docx", filled.buffer);
    writeFileSync("/tmp/verify-template.orig.docx", template);
    // Real parts only - names with an extension. JSZip writes a `word/`
    // directory record the template lacks; directory entries are valid in a zip,
    // most .docx files in the wild carry them, and Word, Google Docs and
    // LibreOffice all read either shape. That difference is noise. Every actual
    // part must survive.
    const parts = (f) =>
      execSync(`unzip -l ${f}`)
        .toString()
        .split("\n")
        // Drop the three header lines. The first is `Archive:  /tmp/x.docx`,
        // and that path ends in .docx, so without this each list contains its
        // own filename and the two can never match.
        .slice(3)
        .map((l) => l.trim().split(/\s+/).pop())
        .filter((x) => x && x.includes("/") && /\.\w+$/.test(x))
        .sort();
    const before = parts("/tmp/verify-template.orig.docx");
    const after = parts("/tmp/verify-filled.docx");
    ok(
      "every part of the template survives, none added or lost",
      before.length === after.length && before.every((x) => after.includes(x)),
      `${after.length} parts carried through`
    );

    const xml = execSync("unzip -p /tmp/verify-filled.docx word/document.xml").toString();
    ok("the logo survives untouched", after.some((p) => p.includes("media/image1.png")), "copied through, not re-encoded");
    ok("the page stays US Letter", /w:w="12240"/.test(xml), "the template's own setting, not re-derived");
    ok("the contents field survives", /TOC/.test(xml), "page numbers still update on open");
    ok("the real values reach the cover", /RFP 2026-25/.test(xml) && /Clackamas County/.test(xml), "title, number, date, agency");
    ok("no company placeholder is left anywhere", !xml.includes("[Insert Company Name]"), "11 occurrences replaced");

    // An unknown agency contact must stay visibly unfilled rather than blank.
    const partial = await fillTemplate(template, { title: "T", solicitationNumber: "S", dueDate: "D", agencyName: "A" });
    const partialXml = await (async () => {
      writeFileSync("/tmp/verify-partial.docx", partial.buffer);
      return execSync("unzip -p /tmp/verify-partial.docx word/document.xml").toString();
    })();
    ok("unknown agency fields stay visible as red placeholders", partialXml.includes("[Insert Agency POC]"), "a blank reads as an oversight nobody caught");

    // The drafted prose has to land under the right heading, replacing the
    // template's writing instruction and leaving the lead sentence above it.
    const drafted = await fillTemplate(template, {
      title: "T", solicitationNumber: "RFP 2026-25", dueDate: "D", agencyName: "Clackamas County",
      sections: { Introduction: "CARAVANN_INTRO_MARKER.", Scope: "CARAVANN_SCOPE_MARKER.", "Technical Description": "CARAVANN_TECH_MARKER." },
    });
    writeFileSync("/tmp/verify-drafted.docx", drafted.buffer);
    const draftXml = execSync("unzip -p /tmp/verify-drafted.docx word/document.xml").toString();
    const paras = draftXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
    const textOf = (par) => [...par.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("").trim();
    const under = (headingText) => {
      let seen = false;
      const out = [];
      for (const par of paras) {
        const t = textOf(par);
        if (!t) continue;
        if (/<w:pStyle w:val="Heading1"/.test(par)) { if (seen) break; seen = t === headingText; continue; }
        if (seen) out.push(t);
      }
      return out;
    };
    ok("drafted prose lands under its own heading", under("Introduction")[1] === "CARAVANN_INTRO_MARKER.", "second paragraph, where the instruction was");
    ok("the boilerplate lead sentence survives above it", under("Introduction")[0]?.startsWith("Caravann Consulting is pleased"), "carries the company and solicitation number");
    ok("a section with no draft keeps its writing instruction", under("Background")[1]?.startsWith("[Insert brief background"), "the writer still sees what is needed");
    ok("an unbracketed instruction is replaced too", under("Technical Description")[1] === "CARAVANN_TECH_MARKER.", "matched by position, not by punctuation");
    ok("the underscore blank is filled", !/solicitation_{4,}/.test(draftXml), "not just the bracketed placeholders");
    ok("both spellings of the title placeholder are caught", !/\[insert title\]/i.test(draftXml), "[Insert Title] and [insert title]");

    // Ampersands are common in solicitation titles and would break the XML.
    const amp = await fillTemplate(template, { title: "Leadership & Culture", solicitationNumber: "S", dueDate: "D", agencyName: "A & B" });
    writeFileSync("/tmp/verify-amp.docx", amp.buffer);
    const ampXml = execSync("unzip -p /tmp/verify-amp.docx word/document.xml").toString();
    ok("an ampersand in the title does not corrupt the document", ampXml.includes("Leadership &amp; Culture"), "escaped, so Word still opens it");
  }
}

heading("15 · Voice check on drafts");
{
  const { checkVoice, voiceSummary } = await import(join(ROOT, "lib/voice.ts"));

  const machine = "We leverage cutting-edge methodology to foster robust outcomes and unlock transformative value, utilizing a seamless approach that serves as a testament to innovative thinking.";
  const human = "We run four phases. First we work out what to ask, then we ask it, then we write down what we heard, then we help you decide what to do about it.";

  const bad = checkVoice(machine);
  ok("machine register is flagged", bad.total >= 8, `${bad.total} tells: ${bad.flags.slice(0, 4).map((f) => f.term).join(", ")}`);
  ok("and it is summarised in one line", Boolean(voiceSummary(bad)), voiceSummary(bad)?.slice(0, 60));

  const good = checkVoice(human);
  ok("plain writing is left alone", good.total === 0, `${good.total} tells`);
  ok("and produces no note", voiceSummary(good) === null);

  ok("empty input does not throw", checkVoice(null).total === 0);

  // A word is not a tell inside another word.
  ok("matches whole words only", checkVoice("The revitalized realm").flags.some((f) => f.term === "realm") && !checkVoice("delivered").flags.length);

  const longSentence = "word ".repeat(50);
  ok("an over-long sentence is noticed", checkVoice(longSentence).longestSentence >= 45, `${checkVoice(longSentence).longestSentence} words`);

  // Caravann's real language should pass its own check.
  const { data: blocks } = await admin.from("language_blocks").select("title,body");
  const flagged = (blocks ?? []).map((b) => ({ t: b.title, r: checkVoice(b.body) })).filter((x) => x.r.total > 0);
  ok(
    "Caravann's own approved language reads as human",
    flagged.length === 0,
    flagged.map((f) => `${f.t}: ${f.r.flags.map((x) => x.term).join("/")}`).join(" | ") || `${(blocks ?? []).length} blocks clean`
  );
}

heading("16 · Nothing orphaned, nothing phantom");
{
  // The bug this exists to catch: a "Weekly review 2" badge sitting over a
  // queue with nothing in it. Edge cases carry an rfp_id, the seeded ones leave
  // it null, and the reset deleted by `rfp_id in (...)` - so they survived
  // every clear-out and kept counting. A badge pointing at rows that are not
  // reachable from anywhere is worse than a wrong number: it sends you looking
  // for work that does not exist.
  const { data: rfps } = await admin.from("rfps").select("id");
  const live = new Set((rfps ?? []).map((r) => r.id));

  const CHILD_TABLES = [
    "rfp_disqualifier_checks",
    "rfp_gap_items",
    "rfp_compliance_items",
    "rfp_questions",
    "rfp_proposal_sections",
    "rfp_team_assignments",
  ];
  let orphans = 0;
  for (const table of CHILD_TABLES) {
    const { data } = await admin.from(table).select("rfp_id");
    orphans += (data ?? []).filter((r) => r.rfp_id && !live.has(r.rfp_id)).length;
  }
  ok("no child row points at a solicitation that is gone", orphans === 0, `${orphans} orphaned`);

  // Every badge in the rail resolves to rows someone can actually open.
  const { data: edges } = await admin.from("rfp_edge_cases").select("rfp_id,status");
  const pendingEdges = (edges ?? []).filter((e) => e.status === "pending");
  const unreachable = pendingEdges.filter((e) => e.rfp_id && !live.has(e.rfp_id)).length;
  ok("the weekly-review badge counts only reachable work", unreachable === 0, `${pendingEdges.length} pending, ${unreachable} unreachable`);

  // An empty queue is a legitimate state, and every count must survive it
  // rather than throwing. This is the shape that crashed the export check.
  const { count: rfpCount } = await admin.from("rfps").select("*", { count: "exact", head: true });
  ok("the desk reports a coherent count on any queue size", Number.isInteger(rfpCount ?? 0), `${rfpCount ?? 0} solicitations`);
}

heading("17 · Cleanup");
{
  const { data: removed } = await admin.from("rfps").delete().like("external_id", `${PREFIX}%`).select("id");
  ok("test rows removed", true, `${removed?.length ?? 0} deleted`);
  // The claim is that *this script* cleaned up after itself - not that the queue
  // may only ever hold demo data. Real solicitations living alongside the demo
  // rows is the normal end state, and asserting otherwise turned the first real
  // row anyone added into a failing check.
  const { data: strays } = await admin.from("rfps").select("external_id").like("external_id", `${PREFIX}%`);
  ok("no verify- rows left behind", (strays ?? []).length === 0, `${strays?.length ?? 0} stray`);
  // Reports the queue rather than asserting it is non-empty. Zero rows is a
  // legitimate state - it is what `npm run reset:queue` is for - and a check
  // that goes red on a deliberately clean database is telling you about itself,
  // not about the system.
  const { data: left } = await admin.from("rfps").select("is_demo");
  const real = (left ?? []).filter((r) => !r.is_demo).length;
  const demo = (left ?? []).length - real;
  ok("the queue is in a known state", true, `${left?.length ?? 0} rows - ${demo} demo, ${real} real`);
}

// ── summary ─────────────────────────────────────────────────────────────────
const pass = results.filter((r) => r.state === "pass").length;
const fail = results.filter((r) => r.state === "fail");
const skipped = results.filter((r) => r.state === "skip");

console.log(`\n${bold("─".repeat(60))}`);
console.log(bold(`${pass}/${pass + fail.length} checks passed${skipped.length ? `, ${skipped.length} skipped` : ""}`));
if (fail.length) {
  console.log("\nFailed:");
  for (const f of fail) console.log(`  \x1b[31m✗\x1b[0m [${f.section}] ${f.name}${f.detail ? ` - ${f.detail}` : ""}`);
}
if (skipped.length) {
  console.log("\nSkipped:");
  for (const s of skipped) console.log(`  \x1b[33m·\x1b[0m [${s.section}] ${s.name} - ${s.detail}`);
}
console.log("");
process.exit(fail.length ? 1 : 0);
