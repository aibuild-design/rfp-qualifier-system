#!/usr/bin/env node
// Seeds realistic demo data so the dashboard can be evaluated before real
// solicitations arrive, and purges it again in one command.
//
//   npm run seed:demo            seed (replaces any existing demo rows)
//   npm run seed:demo -- --purge remove every demo row, leave real ones alone
//
// Everything written here carries is_demo = true, so the dashboard shows a
// warning banner and tags each row inline. The purge deletes strictly on that
// flag, so a real solicitation can never be caught by it.
//
// The profile and sector figures ARE written to the same tables real data
// lives in, because that's the only way the triage engine can be exercised.
// Each row's notes field says it's a placeholder, and that text is visible in
// Settings. Replace them with Caravann's real numbers before trusting a verdict.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  DEMO_ORG_PROFILE,
  DEMO_SECTORS,
  DEMO_TEAM,
  DEMO_RFPS,
  DEMO_LANGUAGE_BLOCKS,
  DEMO_EDGE_CASES,
  DEMO_PORTAL_RULES,
} from "../data/demo-dataset.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

async function loadEnv() {
  const raw = await readFile(join(HERE, "..", ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

// Offsets are in days, but the time of day matters: a deadline reads as
// "Sep 14, 4:39 AM" if you just add 24h increments to the moment you seeded,
// which is not a time any agency closes a solicitation. Pinned to 2:00 PM
// Pacific — the most common submission cutoff in the fixtures — so the
// countdown colours and the exported document both look like real deadlines.
// 21:00Z is 2pm PDT; an hour out under PST, which does not change the date.
const daysFromNow = (n) => {
  const d = new Date(Date.now() + n * 86400_000);
  d.setUTCHours(21, 0, 0, 0);
  return d.toISOString();
};

// PostgREST normalises a bulk insert to the union of keys across the batch and
// fills the gaps with explicit nulls — so a row that omits is_hard_knockout while
// a sibling sets it arrives as NULL and trips the NOT NULL constraint, DEFAULT
// never applying. Filling these in here keeps the fixture data readable (a row
// only states the flags that matter to it) without relying on column defaults
// that a bulk insert bypasses.
const TABLE_DEFAULTS = {
  rfp_disqualifier_checks: { is_required: true, is_hard_knockout: false, notes: null },
  rfp_compliance_items: { is_complete: false, detail: null, due_at: null },
  rfp_questions: { status: "drafted", sent_at: null },
  rfp_gap_items: {},
  language_blocks: { source: null, won: false, is_boilerplate: false, weight: 0 },
};

const withDefaults = (table, rows) => rows.map((r) => ({ ...TABLE_DEFAULTS[table], ...r }));

// Single-row inserts still benefit from dropping undefined, which would
// otherwise override a column DEFAULT with null.
const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

async function main() {
  await loadEnv();
  const purge = process.argv.includes("--purge");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  // Child rows cascade from rfps, so deleting the parents is enough.
  const { data: removed, error: delErr } = await supabase
    .from("rfps")
    .delete()
    .eq("is_demo", true)
    .select("id");
  if (delErr) throw new Error(`purge: ${delErr.message}`);

  // These carry no is_demo flag of their own — they are small, wholly
  // seeded sets, so the seeder owns them outright and clears them on both
  // paths rather than trying to tell seeded rows from hand-added ones.
  await supabase.from("language_blocks").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("rfp_edge_cases").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("portal_rules").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  if (purge) {
    console.log(`✓ Removed ${removed?.length ?? 0} demo RFP(s), plus the language library, edge cases and portal rules.`);
    console.log("\nThe profile and sector map were left in place — they may have");
    console.log("been edited since seeding. Review them in Settings.");
    return;
  }

  if (removed?.length) console.log(`Cleared ${removed.length} existing demo RFP(s).`);

  const { error: orgErr } = await supabase
    .from("org_profile")
    .update(DEMO_ORG_PROFILE)
    .eq("id", true);
  if (orgErr) throw new Error(`org_profile: ${orgErr.message}`);
  console.log("✓ org_profile");

  for (const s of DEMO_SECTORS) {
    const { error } = await supabase.from("sector_experience").upsert(s, { onConflict: "sector" });
    if (error) throw new Error(`sector ${s.sector}: ${error.message}`);
  }
  console.log(`✓ ${DEMO_SECTORS.length} sectors`);

  // team_members has no natural unique key, so clear and reinsert rather than
  // upsert — otherwise re-seeding stacks duplicate rosters.
  await supabase.from("team_members").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: teamErr } = await supabase.from("team_members").insert(DEMO_TEAM);
  if (teamErr) throw new Error(`team_members: ${teamErr.message}`);
  console.log(`✓ ${DEMO_TEAM.length} team members`);

  for (const r of DEMO_RFPS) {
    const { gaps, disqualifiers, compliance, questions, due_in_days, question_deadline_in_days, ...fields } = r;

    const { data: rfp, error } = await supabase
      .from("rfps")
      .insert(
        defined({
          ...fields,
          is_demo: true,
          due_at: due_in_days == null ? null : daysFromNow(due_in_days),
          question_deadline_at:
            question_deadline_in_days == null ? null : daysFromNow(question_deadline_in_days),
          verdict_set_at: fields.status === "pending" ? null : new Date().toISOString(),
        })
      )
      .select("id")
      .single();
    if (error) throw new Error(`rfp ${r.external_id}: ${error.message}`);

    const id = rfp.id;
    const inserts = [];
    if (gaps?.length)
      inserts.push(
        supabase.from("rfp_gap_items").insert(withDefaults("rfp_gap_items", gaps.map((g) => ({ ...g, rfp_id: id }))))
      );
    if (disqualifiers?.length)
      inserts.push(
        supabase
          .from("rfp_disqualifier_checks")
          .insert(withDefaults("rfp_disqualifier_checks", disqualifiers.map((d) => ({ ...d, rfp_id: id }))))
      );
    if (compliance?.length)
      inserts.push(
        supabase.from("rfp_compliance_items").insert(
          withDefaults(
            "rfp_compliance_items",
            compliance.map(({ due_in_days: d, ...c }) => ({
              ...c,
              rfp_id: id,
              due_at: d == null ? null : daysFromNow(d),
            }))
          )
        )
      );
    if (questions?.length)
      inserts.push(
        supabase.from("rfp_questions").insert(withDefaults("rfp_questions", questions.map((q) => ({ ...q, rfp_id: id }))))
      );

    for (const { error: childErr } of await Promise.all(inserts)) {
      if (childErr) throw new Error(`children of ${r.external_id}: ${childErr.message}`);
    }
    const score = r.score_percent == null ? "—" : `${r.score_percent}%`;
    console.log(`  · ${r.status.padEnd(7)} ${score.padStart(4)}  ${r.title.slice(0, 58)}`);
  }

  const { error: lbErr } = await supabase.from("language_blocks").insert(
    withDefaults("language_blocks", DEMO_LANGUAGE_BLOCKS)
  );
  if (lbErr) throw new Error(`language_blocks: ${lbErr.message}`);
  console.log(`✓ ${DEMO_LANGUAGE_BLOCKS.length} language blocks`);

  const { error: ecErr } = await supabase.from("rfp_edge_cases").insert(DEMO_EDGE_CASES);
  if (ecErr) throw new Error(`rfp_edge_cases: ${ecErr.message}`);
  console.log(`✓ ${DEMO_EDGE_CASES.length} edge cases`);

  const { error: prErr } = await supabase.from("portal_rules").insert(DEMO_PORTAL_RULES);
  if (prErr) throw new Error(`portal_rules: ${prErr.message}`);
  console.log(`✓ ${DEMO_PORTAL_RULES.length} portal rules`);

  console.log(`\n✓ ${DEMO_RFPS.length} demo RFPs seeded.`);
  console.log("\nThe dashboard now shows a demo-data banner. Remove it all with:");
  console.log("  npm run seed:demo -- --purge");
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
