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
 * empty for Khaled. Running this does not confirm the profile - that stays a
 * deliberate human action on the settings screen, because the gaps below are
 * exactly the things nobody has checked yet.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { SOURCED_TEAM, SOURCED_LANGUAGE_BLOCKS, SOURCES, CAPABILITIES, SOURCED_RATES } from "../data/caravann-sourced.mjs";

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
  console.log(`  ${status} ${t.name}${t.role ? dim(` - ${t.role}`) : dim(" - role not stated in the source")}`);
}
for (const n of invented) console.log(`  ${bold("drop ")} ${n} ${dim("- placeholder, not a real Caravann consultant")}`);

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
// either way - an existing person is updated, a new one inserted.
const { data: current } = await supabase.from("team_members").select("id,name");
const byName = new Map((current ?? []).map((t) => [t.name, t.id]));
for (const t of SOURCED_TEAM) {
  const id = byName.get(t.name);
  const { error } = id
    ? await supabase.from("team_members").update({ ...t, active: true }).eq("id", id)
    : await supabase.from("team_members").insert({ ...t, active: true });
  if (error) throw new Error(`team write ${t.name}: ${error.message}`);
}

// The demo blocks label themselves in `source` ("Placeholder - replace with
// …"), so that prefix is what identifies them - not a null source, which was
// the first guess and deleted nothing. Sourced blocks are matched on their own
// citation so a re-run replaces rather than duplicates them.
const { error: delPlaceholder } = await supabase.from("language_blocks").delete().ilike("source", "Placeholder%");
if (delPlaceholder) throw new Error(`language delete (placeholders): ${delPlaceholder.message}`);
// Prefix, not equality. The citation text has been edited once already, and
// an exact match against the new string left every row written under the old
// one in place - so the library quietly doubled.
const { error: delPrior } = await supabase.from("language_blocks").delete().or("source.ilike.UCSF IGHS%,source.ilike.Internal Version%");
if (delPrior) throw new Error(`language delete (prior run): ${delPrior.message}`);
const { error: insErr } = await supabase.from("language_blocks").insert(
  // Provenance per block. The deck and the SamTrans submission are different
  // documents with different standing: one is a capability pitch, the other is
  // a real filed proposal, and a reader deciding whether to trust a paragraph
  // should be able to see which it came from.
  SOURCED_LANGUAGE_BLOCKS.map((b) => ({
    won: false,
    weight: 0,
    ...b,
    source: ["terms", "amendments", "acceptance_period", "background", "price"].includes(b.section_type) || b.title === "Who Caravann is"
      ? SOURCES.samtrans
      : SOURCES.ucsf,
  }))
);
if (insErr) throw new Error(`language insert: ${insErr.message}`);

// Only the rate that is unambiguous. Trent's $125 for graphic recording is the
// same figure everywhere it appears in the cost sheet. Khaled's is left alone
// because the sheet and the profile disagree, and Rahul is not added because a
// person with no surname is not something to write into a roster that ends up
// on a proposal.
const trent = SOURCED_RATES.summary.find((r) => r.name === "Trent Wakenight");
if (trent) {
  const { data: row } = await supabase.from("team_members").select("id,rate").eq("name", trent.name).maybeSingle();
  if (row && row.rate === null) {
    await supabase.from("team_members").update({ rate: trent.rate }).eq("id", row.id);
    console.log(`  rate: ${trent.name} -> $${trent.rate}/hr ${dim("(from the SamTrans cost sheet)")}`);
  }
}
console.log(dim(`  ${SOURCED_RATES.openQuestions.length} rate questions for Khaled - see data/caravann-sourced.mjs`));

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
console.log(`  profile_confirmed is still ${profile?.profile_confirmed === true ? "true" : "false"} - this script never sets it.`);
console.log(dim("  Sector counts, certifications, insurance and locations are not in these sources and remain Khaled's to fill.\n"));
