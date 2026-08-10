#!/usr/bin/env node
/**
 * Empty the queue without lobotomising the desk.
 *
 *   npm run reset:queue            show what would go, write nothing
 *   npm run reset:queue -- --yes   do it
 *
 * Deletes every solicitation and everything hanging off one: gate checks, gap
 * items, compliance checklists, drafted questions, proposal sections, team
 * assignments. Demo and real alike, so what is left is genuinely zero.
 *
 * Deliberately does NOT touch what makes the verdicts work:
 *   · org_profile        capabilities, insurance, locations, the confirmation
 *   · sector_experience  the sector map
 *   · team_members       the thirteen real consultants
 *   · language_blocks    Caravann's own proposal language
 *   · scoring_settings   thresholds and rubric weights
 *   · portal_rules       submission rules per portal
 *
 * This exists because `seed:demo -- --purge` is now too blunt: it wipes the
 * language library, which since the sourced import holds Caravann's real
 * writing rather than placeholder text.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GO = process.argv.includes("--yes");

const raw = await readFile(join(ROOT, ".env.local"), "utf8");
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

// Children first. Most have ON DELETE CASCADE, but not all of them do, and a
// half-deleted row is worse than a full one.
const CHILDREN = [
  "rfp_team_assignments",
  "rfp_proposal_sections",
  "rfp_questions",
  "rfp_compliance_items",
  "rfp_gap_items",
  "rfp_disqualifier_checks",
];

// Edge cases carry rfp_id but the seeded ones leave it null, so deleting by
// `rfp_id in (...)` misses them entirely and they linger as a "2 to review"
// badge over an empty queue. Cleared wholesale instead.
const { count: edgeCount } = await supabase.from("rfp_edge_cases").select("*", { count: "exact", head: true });

const { data: rows } = await supabase.from("rfps").select("id,title,status,is_demo");
console.log(bold(`\nSolicitations: ${(rows ?? []).length}`));
if (edgeCount) console.log(dim(`  plus ${edgeCount} edge case(s) awaiting weekly review`));
for (const r of rows ?? []) {
  console.log(`  ${r.is_demo ? "demo" : "real"}  ${String(r.status).padEnd(8)} ${r.title.slice(0, 58)}`);
}

console.log(bold("\nKept, untouched"));
for (const [table, what] of [
  ["org_profile", "capabilities, insurance, locations, confirmation"],
  ["sector_experience", "the sector map"],
  ["team_members", "the consultants"],
  ["language_blocks", "Caravann's own proposal language"],
  ["scoring_settings", "thresholds and rubric weights"],
  ["portal_rules", "portal submission rules"],
]) {
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
  console.log(`  ${String(count ?? 0).padStart(3)}  ${table} ${dim(`- ${what}`)}`);
}

if (!GO) {
  console.log(dim("\nNothing written. Re-run with --yes to empty the queue.\n"));
  process.exit(0);
}

const { error: edgeErr } = await supabase.from("rfp_edge_cases").delete().neq("id", "00000000-0000-0000-0000-000000000000");
if (edgeErr) throw new Error(`rfp_edge_cases: ${edgeErr.message}`);

const ids = (rows ?? []).map((r) => r.id);
if (ids.length === 0) {
  console.log(bold(`\nQueue already empty; cleared ${edgeCount ?? 0} edge case(s).\n`));
  process.exit(0);
}

for (const table of CHILDREN) {
  const { error } = await supabase.from(table).delete().in("rfp_id", ids);
  if (error) throw new Error(`${table}: ${error.message}`);
}
const { error } = await supabase.from("rfps").delete().in("id", ids);
if (error) throw new Error(`rfps: ${error.message}`);

const { count: left } = await supabase.from("rfps").select("*", { count: "exact", head: true });
console.log(bold(`\nQueue emptied. ${ids.length} removed, ${left ?? 0} remaining.`));
console.log(dim("The profile, sector map, roster, language library and settings are untouched.\n"));
