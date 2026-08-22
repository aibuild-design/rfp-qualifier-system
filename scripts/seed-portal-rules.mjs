#!/usr/bin/env node
/**
 * The submission portals Caravann has actually met, and what each one refuses.
 *
 *   node scripts/seed-portal-rules.mjs
 *
 * `portal_rules` is read by /api/rfps/context and printed into the triage
 * prompt under "KNOWN PORTAL RULES (fold any that apply into the compliance
 * checklist)". It has been empty since the table was created, so that heading
 * has always read "None recorded" and every solicitation has had its portal
 * mechanics rediscovered from scratch, or missed.
 *
 * Every rule below is transcribed from a solicitation already archived in
 * source_documents, and each names where it came from. Nothing here is
 * inferred, and nothing here is Khaled's own knowledge of a portal: that is his
 * to add, and this is the floor under it.
 *
 * Idempotent on portal name plus rule text, so re-running adds only what is new.
 */
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const raw = await readFile(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const RULES = [
  // Commonwealth of Virginia. Read off RFP No. 100120-FY27-09, Town of Leesburg.
  [
    "eVA",
    "Offerors must be a registered eVA vendor before they can submit. Registration is free but is not instant, so it belongs at the top of the checklist rather than on the day. Source: Town of Leesburg RFP No. 100120-FY27-09, Section IV.A.",
  ],
  [
    "eVA",
    "Proposals submitted by any method other than the eVA website will not be accepted. Mailed, telephoned, faxed, emailed and verbal offers are refused outright. Source: Town of Leesburg RFP No. 100120-FY27-09, Section IV.A.",
  ],
  [
    "eVA",
    "eVA will not allow an upload after the deadline, and any submission only partially uploaded when the deadline passes is treated as incomplete and refused. Start the upload with time in hand; a large PDF is not an instant operation. Source: Town of Leesburg RFP No. 100120-FY27-09, Section IV.A.",
  ],
  [
    "eVA",
    "All required forms and documentation must be uploaded as a single PDF attachment, named as the RFP number followed by the bidder name. Source: Town of Leesburg RFP No. 100120-FY27-09, Section IV.A.",
  ],
  [
    "eVA",
    "Virginia solicitations routinely also require the offeror to be authorized to transact business in the Commonwealth, evidenced by a State Corporation Commission certificate. That is separate from eVA registration and takes considerably longer. Source: Town of Leesburg RFP No. 100120-FY27-09, Section IV.C.1.",
  ],

  // PlanetBids. Read off Mesa Water RFP No. 2026-1007 and SMUD RFP No. RITM0130193.DP.
  [
    "PlanetBids",
    "Each agency runs its own PlanetBids portal at its own URL, and registration on one is not registration on another. Register on the specific portal named in the solicitation. Source: Mesa Water District RFP No. 2026-1007, Section H.",
  ],
  [
    "PlanetBids",
    "After the stated date and time proposals are not accepted, and faxed or emailed proposals are not accepted at all. Source: Mesa Water District RFP No. 2026-1007, Section H.",
  ],
  [
    "PlanetBids",
    "Where a fee or cost proposal is required separately, it is uploaded to PlanetBids as its own file rather than bound into the technical proposal. Combining them can invalidate a blind price evaluation. Source: Mesa Water District RFP No. 2026-1007, Section H.",
  ],
  [
    "PlanetBids",
    "Communications about the solicitation run through PlanetBids rather than by direct contact with agency staff. Source: Mesa Water District RFP No. 2026-1007, Section I.",
  ],
  [
    "PlanetBids",
    "Questionnaires and attachments are distributed inside PlanetBids as separate documents rather than bound into the RFP PDF, so downloading the RFP alone can leave required forms unnoticed. Source: SMUD RFP No. RITM0130193.DP.",
  ],
];

const { data: existing } = await admin.from("portal_rules").select("portal_name, rule_text");
const seen = new Set((existing ?? []).map((r) => `${r.portal_name} ${r.rule_text}`));
const fresh = RULES.filter(([name, text]) => !seen.has(`${name} ${text}`)).map(([portal_name, rule_text]) => ({
  portal_name,
  rule_text,
}));

if (fresh.length === 0) {
  console.log(`nothing to add - all ${RULES.length} rules already stored`);
} else {
  const { error } = await admin.from("portal_rules").insert(fresh);
  if (error) {
    console.error(`could not store portal rules: ${error.message}`);
    process.exit(1);
  }
  console.log(`added ${fresh.length} rule(s)`);
}

const { data: all } = await admin.from("portal_rules").select("portal_name, rule_text").order("portal_name");
const byPortal = new Map();
for (const r of all ?? []) byPortal.set(r.portal_name, (byPortal.get(r.portal_name) ?? 0) + 1);
for (const [name, n] of byPortal) console.log(`  ${name.padEnd(14)} ${n} rule(s)`);
console.log(`\n${all?.length ?? 0} stored. These print into every triage prompt under KNOWN PORTAL RULES.`);
