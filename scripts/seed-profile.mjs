#!/usr/bin/env node
// Writes an eligibility profile + sector experience map into Supabase from a
// JSON file, so the thing every verdict depends on is version-controlled and
// reproducible rather than typed into a form once and forgotten.
//
//   node scripts/seed-profile.mjs data/caravann-profile.json
//   node scripts/seed-profile.mjs data/caravann-profile.json --dry-run
//
// Sectors are matched on the unique `sector` column, so re-running updates in
// place rather than duplicating. Sectors already in the database but absent
// from the file are LEFT ALONE - this seeds and corrects, it never prunes,
// because silently deleting a sector would silently change every future
// verdict.
//
// A null years_experience/engagement_count is meaningful and preserved: it
// means "we work in this sector but the count is unconfirmed", which the
// triage prompt renders as "? years" rather than treating it as zero.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const HERE = dirname(fileURLToPath(import.meta.url));

async function loadEnv() {
  const raw = await readFile(join(HERE, "..", ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

async function main() {
  await loadEnv();

  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/seed-profile.mjs <profile.json> [--dry-run]");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const data = JSON.parse(await readFile(resolve(file), "utf8"));

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const p = data.org_profile ?? {};
  const sectors = data.sectors ?? [];

  console.log(`Profile from ${file}`);
  console.log(`  offices:     ${(p.office_locations ?? []).join(", ") || "(none)"}`);
  console.log(`  consultants: ${(p.consultant_locations ?? []).join(", ") || "(none)"}`);
  console.log(`  certs:       ${(p.certifications ?? []).join(", ") || "(none)"}`);
  console.log(`  bilingual=${p.bilingual_staff} media=${p.media_production_capable} pr=${p.pr_capable}`);
  console.log(`  sectors:     ${sectors.length}`);
  for (const s of sectors) {
    const yrs = s.years_experience ?? "?";
    const cnt = s.engagement_count ?? "?";
    console.log(`    · ${s.sector} - ${yrs} yrs, ${cnt} engagements`);
  }

  if (dryRun) {
    console.log("\n(dry run - nothing written)");
    return;
  }

  const { error: orgErr } = await supabase
    .from("org_profile")
    .update({
      bilingual_staff: p.bilingual_staff ?? false,
      media_production_capable: p.media_production_capable ?? false,
      pr_capable: p.pr_capable ?? false,
      office_locations: p.office_locations ?? [],
      consultant_locations: p.consultant_locations ?? [],
      certifications: p.certifications ?? [],
      set_aside_status: p.set_aside_status ?? [],
      notes: p.notes ?? null,
    })
    .eq("id", true);
  if (orgErr) throw new Error(`org_profile: ${orgErr.message}`);
  console.log("\n✓ org_profile updated");

  for (const s of sectors) {
    const row = {
      sector: s.sector,
      years_experience: s.years_experience ?? null,
      engagement_count: s.engagement_count ?? null,
      notes: [s.notes, s.provenance && `Source: ${s.provenance}`].filter(Boolean).join(" - ") || null,
    };
    const { error } = await supabase.from("sector_experience").upsert(row, { onConflict: "sector" });
    if (error) throw new Error(`sector ${s.sector}: ${error.message}`);
  }
  console.log(`✓ ${sectors.length} sector(s) upserted`);

  const { count } = await supabase.from("sector_experience").select("*", { count: "exact", head: true });
  console.log(`\n${count} sector row(s) now in the map - the dashboard banner clears at 1 or more.`);
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
