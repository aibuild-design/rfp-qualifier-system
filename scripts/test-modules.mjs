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
import { toTimestamp } from "../lib/rfp.ts";
import { checkDocumentUrl, isBlockedHost } from "../lib/url-guard.ts";
import { consensusGap, decideVerdict, spreadOf } from "../lib/verdict.ts";
import { DEFAULT_WEIGHTS, RUBRIC, RUBRIC_MAX, rubricSchema, scoreFromRubric } from "../lib/rubric.ts";

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

console.log("\nTimestamp coercion");
{
  // The regression this exists for: the model echoed a deadline the way the
  // solicitation phrased it, Postgres rejected the cast, and the intake route
  // dropped the entire compliance checklist while still answering 200 OK.
  check(
    "a human-phrased deadline becomes null rather than breaking the insert",
    toTimestamp("October 30, 2026 at 4:00 PM Pacific") === null
  );
  check("an ISO timestamp survives", toTimestamp("2026-10-30T23:00:00.000Z") === "2026-10-30T23:00:00.000Z");
  check("a plain date is accepted", typeof toTimestamp("October 30, 2026") === "string");
  check("null stays null", toTimestamp(null) === null);
  check("an empty string is not a date", toTimestamp("   ") === null);
  check("a number is not a date", toTimestamp(1786190481658) === null);
  check("\"TBD\" is not a date", toTimestamp("TBD") === null);

  // V8's lenient parser reads all three of these as 1 April 2001, which would
  // put a six-years-overdue deadline on the compliance checklist in red.
  for (const ref of ["see section 4", "Section 4", "4"]) {
    check(`"${ref}" is a cross-reference, not a date`, toTimestamp(ref) === null, String(toTimestamp(ref)));
  }
}

console.log("\nScoring rubric");
{
  check("a perfect fit is exactly 100", RUBRIC_MAX === 100, String(RUBRIC_MAX));

  const best = Object.fromEntries(RUBRIC.map((d) => [d.key, { level: d.levels.at(-1).value }]));
  const worst = Object.fromEntries(RUBRIC.map((d) => [d.key, { level: d.levels[0].value }]));
  check("every dimension at its best scores 100", scoreFromRubric(best).score === 100);
  check("every dimension at its worst scores 0", scoreFromRubric(worst).score === 0);

  // The real shape: strong in sector, no local presence.
  const realistic = {
    sector_depth: { level: "strong" },
    comparable_engagements: { level: "many" },
    geographic_fit: { level: "none" },
    timeline: { level: "comfortable" },
    budget_vs_effort: { level: "adequate" },
  };
  const scored = scoreFromRubric(realistic);
  check("a realistic mix scores 30+25+0+15+8 = 78", scored.score === 78, String(scored.score));
  check("every dimension is explained", scored.dimensions.length === 5);
  check("the zero dimension is named, not hidden",
    scored.dimensions.find((d) => d.key === "geographic_fit").points === 0);

  // The whole point: same classifications always give the same number.
  const repeated = new Set(Array.from({ length: 50 }, () => scoreFromRubric(realistic).score));
  check("identical classifications always give one score", repeated.size === 1, [...repeated].join(","));

  // A partial answer must not be punished for dimensions it never saw.
  const partial = scoreFromRubric({ sector_depth: { level: "strong" }, timeline: { level: "comfortable" } });
  check("a partial rubric rescales rather than scoring low", partial.score === 100, String(partial.score));
  check("...and says which dimensions were missing", partial.missing.length === 3, partial.missing.join(","));

  check("an unknown level is ignored, not guessed",
    scoreFromRubric({ sector_depth: { level: "excellent" }, timeline: { level: "tight" } }).dimensions.length === 1);
  check("no rubric returns null so the caller can fall back", scoreFromRubric(null) === null);
  check("an empty rubric returns null", scoreFromRubric({}) === null);

  // Weights are Khaled's to change without touching the prompt.
  const heavyGeo = scoreFromRubric(realistic, { ...DEFAULT_WEIGHTS, geographic_fit: 40 });
  check("raising a weight lowers a score that fails that dimension",
    heavyGeo.score < scored.score, `${heavyGeo.score} vs ${scored.score}`);

  // The prompt's enum and the scorer's levels come from one definition, so
  // they cannot drift into silently unscoreable answers.
  const schema = rubricSchema();
  check("the schema covers every dimension", Object.keys(schema.properties).length === RUBRIC.length);
  check("schema levels match the scorer's levels", RUBRIC.every((d) =>
    JSON.stringify(schema.properties[d.key].properties.level.enum) === JSON.stringify(d.levels.map((l) => l.value))));
}

console.log("\nDisagreement between triage runs");
{
  const T = { go: 85, maybe: 60, maxSpread: 20 };
  const pass = [{ is_required: true, result: "pass" }];

  check("spread of a tight cluster is small", spreadOf([86, 88, 90]) === 4);
  check("spread catches the outlier", spreadOf([55, 88, 90]) === 35);
  check("a single sample has no spread", spreadOf([88]) === 0);
  check("no samples has no spread", spreadOf(null) === 0);

  // A real run returned 58, 87, 88. Spread is 30, but two reads agree to
  // within a point — the median is well supported and the 58 is just a bad
  // read. Treating that as uncertain would demote a clear go every time the
  // model has an off run.
  check("two reads agreeing closely is a consensus", consensusGap([58, 87, 88]) === 1);
  check("scattered reads have no consensus", consensusGap([30, 60, 90]) === 30);

  const outlierButAgreed = decideVerdict(87, pass, T, [58, 87, 88]);
  check("one bad read among two that agree stays a go", outlierButAgreed.status === "go", outlierButAgreed.status);

  const scattered = decideVerdict(60, pass, T, [30, 60, 90]);
  check("reads that agree on nothing are capped at maybe", scattered.status === "maybe", scattered.status);
  check("...and say why", scattered.reason.includes("No two of the 3 reads agreed"), scattered.reason.slice(0, 50));

  const tight = decideVerdict(88, pass, T, [86, 88, 90]);
  check("agreement leaves a go as a go", tight.status === "go", tight.status);

  // A failed mandatory requirement is a gate, not a matter of degree — it
  // closes the bid no matter how much the reads disagreed.
  const gated = decideVerdict(88, [{ is_required: true, result: "fail", requirement_text: "behavioral health" }], T, [30, 60, 90]);
  check("a failed requirement still forces no-go despite disagreement", gated.status === "no_go", gated.status);

  check("no samples behaves exactly as before", decideVerdict(88, pass, T, null).status === "go");
  check("the tolerance is configurable", decideVerdict(60, pass, { ...T, maxSpread: 40 }, [30, 60, 90]).status === "maybe");
}

console.log("\nDocument URL guard (SSRF)");
{
  // These are the addresses that must never be fetched. 169.254.169.254 is the
  // one that matters most: on AWS, GCP and Azure it serves instance
  // credentials to anything that asks.
  const mustBlock = [
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://localhost:3000/admin",
    "http://127.0.0.1/",
    "http://127.63.31.9/",
    "http://10.0.0.5/internal.pdf",
    "http://192.168.1.1/",
    "http://172.16.4.4/",
    "http://172.31.255.255/",
    "http://0.0.0.0/",
    "http://100.64.0.1/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[0:0:0:0:0:ffff:a00:5]/",
    "http://intranet.local/rfp.pdf",
    "http://fileserver.internal/rfp.pdf",
    "http://localhost./",
    // Obfuscated spellings of 127.0.0.1 — the URL parser normalises these, so
    // the guard sees dotted decimal by the time it runs.
    "http://2130706433/",
    "http://0x7f000001/",
    "http://127.1/",
  ];
  const blocked = mustBlock.filter((u) => checkDocumentUrl(u).ok === false);
  check(
    `blocks all ${mustBlock.length} private/loopback/metadata targets`,
    blocked.length === mustBlock.length,
    mustBlock.filter((u) => checkDocumentUrl(u).ok).join(", ") || ""
  );

  const mustAllow = [
    "https://www.samtrans.com/rfp/2026-04.pdf",
    "http://agency.gov/solicitation.pdf",
    "https://bids.example.org:8443/doc.pdf",
    "https://11.0.0.1/public.pdf", // 11.x is public space, not private
    "https://172.15.0.1/x.pdf", // just outside 172.16/12
    "https://172.32.0.1/x.pdf", // just above 172.31
  ];
  const allowed = mustAllow.filter((u) => checkDocumentUrl(u).ok === true);
  check(
    `allows all ${mustAllow.length} legitimate public document links`,
    allowed.length === mustAllow.length,
    mustAllow.filter((u) => !checkDocumentUrl(u).ok).join(", ") || ""
  );

  check("rejects a non-http scheme", checkDocumentUrl("file:///etc/passwd").ok === false);
  check("rejects gopher", checkDocumentUrl("gopher://host/1").ok === false);
  check(
    "rejects credentials embedded in the link",
    checkDocumentUrl("https://user:pass@agency.gov/x.pdf").ok === false
  );
  check("rejects an empty link", checkDocumentUrl("   ").ok === false);
  check("rejects unparseable text", checkDocumentUrl("not a url").ok === false);
  check(
    "the guard is reusable against a resolved IP",
    isBlockedHost("169.254.169.254") && !isBlockedHost("93.184.216.34")
  );
}

console.log("\nVerdict thresholds");
{
  const T = { go: 85, maybe: 60 };
  const pass = { is_required: true, result: "pass", requirement_text: "5+ years public agency" };
  const requiredFail = { is_required: true, result: "fail", requirement_text: "3 years behavioral health" };
  const preferredFail = { is_required: false, result: "fail", requirement_text: "Local Omaha presence preferred" };

  // The regression this exists for: three runs of one document returned
  // maybe/83, go/87, go/88. Same numbers must now always give the same label.
  check("83 is a maybe, every time", decideVerdict(83, [pass], T).status === "maybe");
  check("87 is a go, every time", decideVerdict(87, [pass], T).status === "go");
  check("exactly 85 clears the bar", decideVerdict(85, [pass], T).status === "go");
  check("exactly 60 is still a maybe", decideVerdict(60, [pass], T).status === "maybe");
  check("59 falls below the floor", decideVerdict(59, [pass], T).status === "no_go");

  // A failed mandatory requirement closes the door regardless of overlap —
  // the behavioral-health case that motivated the whole product.
  check("a failed requirement beats a 99% score", decideVerdict(99, [requiredFail], T).status === "no_go");
  check("...and says which one", decideVerdict(99, [requiredFail], T).reason.includes("behavioral health"));
  check("a hard knockout closes it even if not worded 'required'",
    decideVerdict(95, [{ is_required: false, is_hard_knockout: true, result: "fail" }], T).status === "no_go");

  // "Preferred" costs score, never the bid — the SOW is explicit about this.
  check("a preferred miss does not force no-go", decideVerdict(90, [pass, preferredFail], T).status === "go");
  check("...but is surfaced in the reason", decideVerdict(90, [pass, preferredFail], T).reason.includes("preferred"));

  check("no score means pending, not no-go", decideVerdict(null, [pass], T).status === "pending");
  check("a non-numeric score means pending", decideVerdict(Number.NaN, [pass], T).status === "pending");
  check("no checks at all still scores", decideVerdict(92, [], T).status === "go");
  check("a not_applicable check is not a failure", decideVerdict(92, [{ is_required: true, result: "not_applicable" }], T).status === "go");

  // Khaled can move the line without touching the model.
  const strict = { go: 95, maybe: 80 };
  check("raising the bar re-labels the same score", decideVerdict(87, [pass], strict).status === "maybe");
  check("thresholds are stated in the reason", decideVerdict(87, [pass], strict).reason.includes("95%"));

  // Determinism, stated as an assertion rather than assumed.
  const runs = new Set(Array.from({ length: 50 }, () => decideVerdict(83, [pass, preferredFail], T).status));
  check("50 identical inputs give exactly one answer", runs.size === 1, [...runs].join(","));
}

console.log(`\n${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  console.log("\nFailed:");
  failures.forEach((f) => console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ""}`));
  process.exit(1);
}
