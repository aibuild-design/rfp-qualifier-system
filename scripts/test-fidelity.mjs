#!/usr/bin/env node
// Does what Settings says actually reach the analysis and the proposal?
//
// Every other test checks that a function returns what it should. This checks
// something different and less obvious: that a number typed into Settings is
// the number the desk reasons with, and the number that prints in a document
// sent to a public agency. Those are three separate places and nothing was
// comparing them.
//
// Uses no OpenRouter credit. The triage context is an HTTP read, the gate is
// pure code, and the proposal is assembled by the same route the Download
// button uses. Nothing here calls a model.
//
//   npm run test:fidelity          # needs a server on APP_URL (default :3100)

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

const APP_URL = process.env.APP_URL ?? "http://localhost:3100";

for (const line of (await readFile(new URL("../.env.local", import.meta.url), "utf8")).split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// ── what Settings currently holds ─────────────────────────────────────────
const [{ data: profile }, { data: scoring }, { data: sectors }, { data: knockouts }, { data: engagements }] =
  await Promise.all([
    supabase.from("org_profile").select("*").eq("id", true).maybeSingle(),
    supabase.from("scoring_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("sector_experience").select("*").order("sector"),
    supabase.from("hard_knockouts").select("*"),
    supabase.from("past_engagements").select("*"),
  ]);

console.log("\n▸ Settings reach the analysis");
{
  const res = await fetch(`${APP_URL}/api/rfps/context`, {
    headers: { Authorization: `Bearer ${process.env.RFP_INTAKE_API_KEY}` },
  });
  check("triage context responds", res.ok, `HTTP ${res.status}`);
  const context = res.ok ? await res.json() : {};
  const flat = JSON.stringify(context);

  // Every field a person can edit has to survive the trip. A field that is
  // recorded and never sent is a setting that silently does nothing.
  for (const [field, value] of Object.entries(profile ?? {})) {
    if (field === "id" || field === "updated_at" || value === null || value === "") continue;
    // Nested objects are checked by their leaves. String({}) is
    // "[object Object]", which is present in nothing and absent from
    // everything, so comparing it would pass or fail for no reason.
    const leaves =
      Array.isArray(value) ? value
      : typeof value === "object" ? Object.values(value).flat()
      : [value];
    const present = leaves.length === 0 || leaves.every((v) => flat.includes(String(v)));
    check(`profile.${field} reaches triage`, present);
  }

  for (const s of sectors ?? []) {
    check(`sector "${s.sector}" reaches triage`, flat.includes(s.sector));
  }
}

console.log("\n▸ Settings decide the verdict");
{
  const { decideVerdict } = await import("../lib/verdict.ts");
  const T = {
    go: scoring.go_threshold,
    maybe: scoring.maybe_threshold,
    knockouts: knockouts ?? [],
  };
  const pass = { requirement_text: "Organizational assessment.", is_required: true, result: "pass" };

  check(
    `a score on the go bar (${T.go}%) is a go`,
    decideVerdict(T.go, [pass], T).status === "go",
    decideVerdict(T.go, [pass], T).status,
  );
  check(
    `one below the maybe floor (${T.maybe - 1}%) is a no-go`,
    decideVerdict(T.maybe - 1, [pass], T).status === "no_go",
    decideVerdict(T.maybe - 1, [pass], T).status,
  );
  check("the reason states the threshold it used", decideVerdict(T.go, [pass], T).reason.includes(`${T.go}%`));

  for (const k of knockouts ?? []) {
    const d = decideVerdict(95, [{ requirement_text: `This engagement requires ${k.term}.`, is_required: true, result: "fail" }], T);
    check(`dealbreaker "${k.term}" closes a 95% bid`, d.status === "no_go", d.status);
    check(`...and the reason names it`, d.reason.toLowerCase().includes(k.term.toLowerCase()));
  }
}

console.log("\n▸ Settings print in the proposal");
{
  const { data: rfp } = await supabase
    .from("rfps")
    .select("id")
    .eq("external_id", "leesburg-100120-FY27-09")
    .maybeSingle();

  if (!rfp) {
    check("a proposal exists to check", false, "load the Leesburg solicitation first");
  } else {
    const anonymous = await fetch(`${APP_URL}/api/rfps/${rfp.id}/docx`);
    check("the document route requires a session", anonymous.status === 401, `HTTP ${anonymous.status}`);

    // Through the real route, with a real session. A second assembler written
    // for the test drifted from the real one within minutes of being written -
    // it omitted the agency address and contact that the app does pass, and
    // then reported the app as broken. There is only one assembler now.
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ args: ["--disable-dev-shm-usage", "--no-sandbox"] });
    let buffer;
    try {
      const page = await (await browser.newContext()).newPage();
      await page.goto(`${APP_URL}/login`, { waitUntil: "domcontentloaded" });
      await page.fill("input[type=email]", process.env.VERIFY_LOGIN_EMAIL);
      await page.fill("input[type=password]", process.env.VERIFY_LOGIN_PASSWORD);
      await Promise.all([page.waitForURL(/\/dashboard/, { timeout: 60000 }), page.click("button[type=submit]")]);
      const res = await page.request.get(`${APP_URL}/api/rfps/${rfp.id}/docx`);
      check("the document builds for a signed-in user", res.ok(), `HTTP ${res.status()}`);
      buffer = await res.body();
    } finally {
      await browser.close();
    }

    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml").async("string");
    const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    // The firm's own details print on the cover of every submission.
    for (const field of ["legal_name", "address", "point_of_contact", "telephone", "email", "cage_code", "uei"]) {
      const value = profile?.[field];
      if (!value) continue;
      check(`profile.${field} prints in the document`, text.includes(String(value)), String(value).slice(0, 40));
    }

    // Delivered engagements fill the numbered reference blocks.
    for (const e of (engagements ?? []).filter((x) => x.won)) {
      check(`engagement "${e.client}" appears in past performance`, text.includes(e.client));
    }

    const reds = [...xml.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)]
      .map((m) => m[0])
      .filter((run) => /<w:color w:val="(ff0000|c00000)"/i.test(run))
      .map((run) => [...run.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join("").trim())
      .filter(Boolean);
    check("nothing is left unfilled", reds.length === 0, reds.slice(0, 3).join(" | "));
  }
}

console.log(`\n${passed}/${passed + failed} fidelity checks passed.`);
if (failed) process.exitCode = 1;
