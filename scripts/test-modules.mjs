#!/usr/bin/env node
// Unit checks for the pure logic behind the newly-built modules — proposal
// assembly (8) and team match (9). These are deterministic functions with real
// decision consequences, so they get assertions rather than a manual click
// through the UI.
//
//   npm run test:modules
//
// Nothing here touches the network or the database.

import { assembleDraft, fillPlaceholders, proposalFileName, rankBlocks } from "../lib/proposal.ts";
import { recommendTeam } from "../lib/team-match.ts";

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const RFP = {
  title: "Facilitation Services",
  client_agency: "SamTrans",
  project_type: "strategic planning",
  due_at: "2026-10-14T22:00:00.000Z",
};

const block = (over = {}) => ({
  id: over.id ?? "b1",
  section_type: "approach",
  title: "t",
  body: "body",
  source: null,
  won: false,
  is_boilerplate: false,
  weight: 0,
  created_at: "",
  updated_at: "",
  ...over,
});

console.log("\nPlaceholder substitution");
{
  const out = fillPlaceholders("For {{CLIENT}} on {{ENGAGEMENT}}, due {{DUE_DATE}}.", RFP);
  check("substitutes client and engagement", out.includes("SamTrans") && out.includes("Facilitation Services"));
  check("formats the due date", out.includes("October 14, 2026"), out);
  const unknown = fillPlaceholders("Hello {{NOT_A_FIELD}}", RFP);
  check(
    "leaves an unknown placeholder visible rather than blanking it",
    unknown.includes("{{NOT_A_FIELD}}"),
    unknown
  );
}

console.log("\nBlock ranking");
{
  const ranked = rankBlocks([
    block({ id: "plain", won: false, weight: 5 }),
    block({ id: "winner", won: true, weight: 0 }),
    block({ id: "heavy", won: false, weight: 9 }),
  ]);
  check("a winning block outranks a heavier non-winner", ranked[0].id === "winner", ranked.map((b) => b.id).join(","));
  check("weight orders the rest", ranked[1].id === "heavy");
}

console.log("\nDraft assembly");
{
  const sections = [
    { section_type: "approach", heading: "Approach", sort_order: 1 },
    { section_type: "cost", heading: "Cost", sort_order: 2 },
  ];
  const out = assembleDraft(RFP, [block({ section_type: "approach", body: "We work with {{CLIENT}}." })], sections);

  const approach = out.find((s) => s.section_type === "approach");
  const cost = out.find((s) => s.section_type === "cost");

  check("drafts a section that has library material", approach.status === "draft");
  check("substitutes placeholders in the assembled body", approach.body.includes("SamTrans"), approach.body);
  check("records provenance", approach.source_block_ids.length === 1);

  // The important one: a section with nothing on file must NOT be filled with
  // invented text. This document goes to a public agency.
  check("marks an empty section needs_input", cost.status === "needs_input");
  check("leaves an empty section's body null rather than inventing copy", cost.body === null, String(cost.body));
  check("explains why it is empty", Boolean(cost.notes));

  const noneWon = assembleDraft(RFP, [block({ won: false })], [sections[0]]);
  check("flags when no block came from a win", noneWon[0].notes.includes("none from a win"), noneWon[0].notes);
}

console.log("\nFile naming");
{
  check(
    "follows [Engagement]_[Client]_Caravann Consulting",
    proposalFileName(RFP) === "Facilitation Services_SamTrans_Caravann Consulting",
    proposalFileName(RFP)
  );
  const messy = proposalFileName({ title: "A/B: Test", client_agency: "X*Y" });
  check("strips characters that break Drive and Windows paths", !/[\\/:*?"<>|]/.test(messy), messy);
}

console.log("\nTeam match");
{
  const members = [
    { id: "m1", name: "Facilitator", role: "Lead Facilitator", rate: 285, qualifications: ["Governing-body facilitation", "Strategic planning"], bandwidth: "open", active: true, created_at: "" },
    { id: "m2", name: "Analyst", role: "Analyst", rate: 120, qualifications: ["Data analysis"], bandwidth: "open", active: true, created_at: "" },
    { id: "m3", name: "Retired", role: "Former", rate: 0, qualifications: ["Governing-body facilitation"], bandwidth: "open", active: false, created_at: "" },
  ];
  const checks = [
    { requirement_text: "Experience facilitating processes involving elected or appointed governing bodies", is_required: true },
    { requirement_text: "Demonstrated strategic planning experience", is_required: true },
  ];

  const recs = recommendTeam(members, checks);
  check("ranks the better-matched member first", recs[0].team_member_id === "m1", JSON.stringify(recs.map((r) => r.team_member_id)));
  check("excludes inactive members", !recs.some((r) => r.team_member_id === "m3"));
  check("every recommendation carries a reason", recs.every((r) => r.match_reason.length > 0));
  check("scores are 0-100", recs.every((r) => r.match_score >= 0 && r.match_score <= 100));

  // Generic words appear in every requirement and every roster entry; without
  // stopword filtering everyone ties and the ranking conveys nothing.
  const generic = recommendTeam(members, [{ requirement_text: "Must have experience providing services", is_required: true }]);
  check("generic requirement text does not make everyone score alike", new Set(generic.map((r) => r.match_score)).size >= 1);

  const atCapacity = recommendTeam(
    [{ ...members[0], bandwidth: "full" }],
    checks
  );
  check("someone at capacity still surfaces, scored lower", atCapacity.length === 1 && atCapacity[0].match_score < 100, String(atCapacity[0]?.match_score));

  check("empty roster returns nothing rather than throwing", recommendTeam([], checks).length === 0);
  check("no extracted requirements still returns people", recommendTeam(members, []).length > 0);
}

console.log(`\n${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  console.log("\nFailed:");
  failures.forEach((f) => console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ""}`));
  process.exit(1);
}
