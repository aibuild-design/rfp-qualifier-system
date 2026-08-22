#!/usr/bin/env node
/**
 * Write a proposal's adaptive sections with Claude Code standing in for
 * OpenRouter, then assemble the document.
 *
 *   node scripts/compose-local.mjs prompt <external_id>    writes one prompt per section
 *   node scripts/compose-local.mjs build  <external_id>    vets the drafts and builds the .docx
 *
 * The counterpart to triage-local.mjs, and the same rule applies: nothing about
 * how a section is written lives in this file. The context comes from
 * lib/compose-context, the prompt from lib/compose's composePrompt, the
 * cleanup and the honesty check from cleanComposed and vetComposed, and the
 * document from lib/proposal-document's assembleProposalDocx - the same
 * functions the dashboard button calls. Only the reader is different.
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { ADAPTIVE_SECTIONS, cleanComposed, composePrompt, vetComposed } from "../lib/compose.ts";
import { buildComposeContext } from "../lib/compose-context.ts";
import { assembleDraft, DEFAULT_SECTIONS, proposalFileName } from "../lib/proposal.ts";
import { assembleProposalDocx } from "../lib/proposal-document.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = join(ROOT, "scripts/scratch");
const OUT = join(ROOT, "scripts/scratch/out");

const raw = await readFile(join(ROOT, ".env.local"), "utf8");
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const [command, externalId] = process.argv.slice(2);
if (!command || !externalId) {
  console.error("usage: compose-local.mjs <prompt|build> <external_id>");
  process.exit(1);
}
await mkdir(SCRATCH, { recursive: true });
await mkdir(OUT, { recursive: true });

const { data: rfp } = await admin.from("rfps").select("*").eq("external_id", externalId).maybeSingle();
if (!rfp) throw new Error(`no solicitation with external_id "${externalId}"`);

const { data: blocks } = await admin.from("language_blocks").select("*");
const { data: addenda } = await admin.from("rfp_related_documents").select("kind, sequence").eq("rfp_id", rfp.id);
const sections = assembleDraft(rfp, blocks ?? [], DEFAULT_SECTIONS, addenda ?? []);
const wanted = sections.filter((s) => s.section_type in ADAPTIVE_SECTIONS);
const { base, sourceFor, team } = await buildComposeContext(admin, rfp.id, rfp);

if (command === "prompt") {
  console.log(`${rfp.title}\n${rfp.client_agency}  ·  ${rfp.status} ${rfp.score_percent}%\n`);
  console.log(`context   ${base.requirements.length} requirements · ${base.rules.length} rules · ${base.gaps.length} gaps`);
  console.log(`          ${team.length} confirmed team · ${base.engagements.length} ranked engagements · ${base.capabilities.length} capabilities`);
  console.log(`          solicitation ${base.solicitation ? `${base.solicitation.length.toLocaleString()} chars` : "NOT ARCHIVED"}`);
  console.log(`          cannot: ${base.cannot.join(", ") || "nothing recorded as absent"}\n`);
  for (const s of wanted) {
    const context = { ...base, source: sourceFor(s.section_type) };
    const prompt = composePrompt(s.section_type, context);
    await writeFile(join(SCRATCH, `compose-${externalId}-${s.section_type}.txt`), prompt);
    console.log(`  ${s.section_type.padEnd(24)} ${prompt.length.toLocaleString().padStart(8)} chars   ${sourceFor(s.section_type).length} library blocks`);
  }
  console.log(`\nWrite each as scripts/scratch/draft-${externalId}-<section_type>.md, then:`);
  console.log(`  node scripts/compose-local.mjs build ${externalId}`);
}

if (command === "build") {
  const files = (await readdir(SCRATCH)).filter((f) => f.startsWith(`draft-${externalId}-`) && f.endsWith(".md"));
  const composed = new Map();
  let rejected = 0;

  console.log("Vetting each drafted section with the app's own guard\n");
  for (const s of wanted) {
    const file = `draft-${externalId}-${s.section_type}.md`;
    if (!files.includes(file)) {
      console.log(`  ${"·".padEnd(2)} ${s.section_type.padEnd(24)} no draft, the library stitch stands`);
      continue;
    }
    const text = cleanComposed(await readFile(join(SCRATCH, file), "utf8"), s.heading);
    const grounded = sourceFor(s.section_type).map((b) => b.body).join(" ");
    const verdict = vetComposed(text, team.map((m) => m.name), grounded, s.section_type, base.cannot);
    const words = text.split(/\s+/).filter(Boolean).length;
    if (verdict.ok) {
      composed.set(s.section_type, text);
      console.log(`  \x1b[32m✓\x1b[0m ${s.section_type.padEnd(24)} ${String(words).padStart(5)} words`);
    } else {
      rejected++;
      console.log(`  \x1b[31m✗\x1b[0m ${s.section_type.padEnd(24)} ${String(words).padStart(5)} words   REJECTED: ${verdict.reason}`);
    }
  }

  for (const section of sections) {
    const text = composed.get(section.section_type);
    if (!text) continue;
    section.body = text;
    section.status = "draft";
    section.notes = "Written for this solicitation from the analysis.";
  }

  await admin.from("rfp_proposal_sections").delete().eq("rfp_id", rfp.id).neq("status", "approved");
  const { data: existing } = await admin.from("rfp_proposal_sections").select("section_type").eq("rfp_id", rfp.id);
  const approved = new Set((existing ?? []).map((s) => s.section_type));
  const rows = sections
    .filter((s) => !approved.has(s.section_type))
    .map((s, i) => ({
      rfp_id: rfp.id,
      section_type: s.section_type,
      heading: s.heading,
      body: s.body,
      status: s.status,
      notes: s.notes ?? null,
      sort_order: s.sort_order ?? i * 10,
    }));
  const { error } = await admin.from("rfp_proposal_sections").insert(rows);
  if (error) throw new Error(`could not store sections: ${error.message}`);

  const [{ data: stored }, { data: engagements }, { data: firm }, { data: relatedDocs }] = await Promise.all([
    admin.from("rfp_proposal_sections").select("*").eq("rfp_id", rfp.id).order("sort_order"),
    admin.from("past_engagements").select("*"),
    admin.from("org_profile").select("*").eq("id", true).maybeSingle(),
    admin.from("rfp_related_documents").select("*").eq("rfp_id", rfp.id).eq("kind", "addendum").order("sequence"),
  ]);

  const buffer = await assembleProposalDocx({
    rfp,
    sections: stored ?? [],
    engagements: engagements ?? [],
    addenda: (relatedDocs ?? []).map((d) => ({ title: d.title, sequence: d.sequence, received_at: d.received_at ?? null })),
    firm: firm ?? null,
  });
  if (!buffer) throw new Error("assembleProposalDocx returned nothing - is the template stored?");

  const name = `${proposalFileName(rfp)}.docx`;
  await writeFile(join(OUT, name), buffer);
  const totalWords = (stored ?? []).reduce((n, s) => n + (s.body?.split(/\s+/).filter(Boolean).length ?? 0), 0);
  console.log(`\nsections   ${(stored ?? []).length} stored, ${composed.size} written for this bid, ${rejected} rejected`);
  console.log(`words      ${totalWords.toLocaleString()}`);
  console.log(`document   scripts/scratch/out/${name}  (${(buffer.length / 1024).toFixed(0)} KB)`);
}
