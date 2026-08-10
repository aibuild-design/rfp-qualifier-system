#!/usr/bin/env node
/**
 * Load the data taken from Caravann's own documents.
 *
 *   npm run seed:sourced             show what would change, write nothing
 *   npm run seed:sourced -- --apply  write it
 *
 * Separate from `seed:demo` on purpose. That script writes plausible invented
 * figures and labels them as such; this one writes only what a real Caravann
 * document actually says, and leaves every field the documents do not cover
 * empty for Khaled. Running this does not confirm the profile — that stays a
 * deliberate human action on the settings screen, because the gaps below are
 * exactly the things nobody has checked yet.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { SOURCED_TEAM, SOURCED_LANGUAGE_BLOCKS, SOURCES, CAPABILITIES } from "../data/caravann-sourced.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

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

console.log(bold("\nSource"));
for (const [key, cite] of Object.entries(SOURCES)) console.log(`  ${key}: ${cite}`);

// ── team ────────────────────────────────────────────────────────────────────
const { data: existingTeam } = await supabase.from("team_members").select("name");
const have = new Set((existingTeam ?? []).map((t) => t.name));
const incoming = new Set(SOURCED_TEAM.map((t) => t.name));
const invented = [...have].filter((n) => !incoming.has(n));

console.log(bold("\nTeam roster"));
console.log(`  currently ${have.size} people, sourced list has ${incoming.size}`);
for (const t of SOURCED_TEAM) {
  const status = have.has(t.name) ? "keep " : "add  ";
  console.log(`  ${status} ${t.name}${t.role ? dim(` — ${t.role}`) : dim(" — role not stated in the source")}`);
}
for (const n of invented) console.log(`  ${bold("drop ")} ${n} ${dim("— placeholder, not a real Caravann consultant")}`);

// ── language ────────────────────────────────────────────────────────────────
const { data: existingBlocks } = await supabase.from("language_blocks").select("title,source");
console.log(bold("\nLanguage library"));
console.log(`  currently ${(existingBlocks ?? []).length} blocks, replacing the generic ones with ${SOURCED_LANGUAGE_BLOCKS.length} from Caravann's own deck`);
for (const b of SOURCED_LANGUAGE_BLOCKS) console.log(`  add   [${b.section_type}] ${b.title}`);

if (!APPLY) {
  console.log(dim("\nNothing written. Re-run with --apply to make these changes.\n"));
  process.exit(0);
}

// Placeholder people are removed rather than deactivated: leaving invented
// names in the roster is how they end up on a real proposal.
if (invented.length) {
  const { error } = await supabase.from("team_members").delete().in("name", invented);
  if (error) throw new Error(`team delete: ${error.message}`);
}
// Matched on name by hand rather than upsert: there is no unique constraint on
// team_members.name, so ON CONFLICT has nothing to key against. Re-runnable
// either way — an existing person is updated, a new one inserted.
const { data: current } = await supabase.from("team_members").select("id,name");
const byName = new Map((current ?? []).map((t) => [t.name, t.id]));
for (const t of SOURCED_TEAM) {
  const id = byName.get(t.name);
  const { error } = id
    ? await supabase.from("team_members").update({ ...t, active: true }).eq("id", id)
    : await supabase.from("team_members").insert({ ...t, active: true });
  if (error) throw new Error(`team write ${t.name}: ${error.message}`);
}

// The demo blocks label themselves in `source` ("Placeholder — replace with
// …"), so that prefix is what identifies them — not a null source, which was
// the first guess and deleted nothing. Sourced blocks are matched on their own
// citation so a re-run replaces rather than duplicates them.
const { error: delPlaceholder } = await supabase.from("language_blocks").delete().ilike("source", "Placeholder%");
if (delPlaceholder) throw new Error(`language delete (placeholders): ${delPlaceholder.message}`);
const { error: delPrior } = await supabase.from("language_blocks").delete().eq("source", SOURCES.ucsf);
if (delPrior) throw new Error(`language delete (prior run): ${delPrior.message}`);
const { error: insErr } = await supabase.from("language_blocks").insert(
  SOURCED_LANGUAGE_BLOCKS.map((b) => ({ won: false, weight: 0, ...b, source: SOURCES.ucsf }))
);
if (insErr) throw new Error(`language insert: ${insErr.message}`);

// What Caravann does, stated on its own capability slide. This is the only
// place the desk can learn that a "cultural transformation" solicitation is
// core business rather than an adjacent guess.
const { error: capErr } = await supabase.from("org_profile").update({ capabilities: CAPABILITIES }).eq("id", true);
if (capErr) throw new Error(`capabilities: ${capErr.message}`);
console.log(
  `  capabilities: ${CAPABILITIES.functional_areas.length} functional areas, ` +
  `${CAPABILITIES.key_capabilities.length} capabilities, ${CAPABILITIES.subject_areas.length} subject areas`
);

const { data: profile } = await supabase.from("org_profile").select("profile_confirmed").eq("id", true).maybeSingle();
console.log(bold("\nWritten."));
console.log(`  profile_confirmed is still ${profile?.profile_confirmed === true ? "true" : "false"} — this script never sets it.`);
console.log(dim("  Sector counts, certifications, insurance and locations are not in these sources and remain Khaled's to fill.\n"));
