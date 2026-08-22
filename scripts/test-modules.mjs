#!/usr/bin/env node
// Unit checks for the pure logic behind the newly-built modules - proposal
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
import { DEFAULT_SUBJECT_TERMS, emailQualifies, namedAsSolicitation, sentByTheDesk } from "../lib/intake-filter.ts";
import { classifyDocument } from "../lib/document-kind.ts";
import { splitEdgeCase } from "../lib/edge-case-text.ts";
import { DEFAULT_WEIGHTS, RUBRIC, RUBRIC_MAX, rubricSchema, scoreFromRubric } from "../lib/rubric.ts";

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` - ${detail}` : ""}`);
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

console.log("\nIntake filter");
{
  const base = { terms: [...DEFAULT_SUBJECT_TERMS], ignoreTerms: [] };
  const qualifies = (email, f = base) => emailQualifies(email, f);

  check("a plain solicitation subject qualifies", qualifies({ subject: "RFP No. 100120-FY27-09" }));
  check("a plural still qualifies", qualifies({ subject: "Re: RFPs open this week" }));
  check("punctuation around the term does not break it", qualifies({ subject: "Re: RFP/RFQ opportunities" }));

  // The one that started this. su-rfp-erch contains the letters, and a plain
  // substring match read a fishing report as a solicitation.
  check("a term inside a longer word does not qualify", !qualifies({ subject: "Surfperch fishing report" }));
  check("...nor does a term inside a longer word in the body", !qualifies({ subject: "Weekend plans", body: "went surfperch fishing" }));

  // Where agencies actually put the solicitation number.
  check(
    "the attachment name qualifies an otherwise blank subject",
    qualifies({ subject: "Please see attached", attachments: ["RFP No. 2026-14.pdf"] }),
  );
  check(
    "an attachment object with a fileName is read the same way",
    qualifies({ subject: "Documents", attachments: ["Request for Proposals - Leadership.docx"] }),
  );
  check("an unrelated attachment does not qualify", !qualifies({ subject: "Invoice", attachments: ["march-invoice.pdf"] }));

  // The ignore list has to actually do something, which in production it never did.
  const ignoring = { ...base, ignoreTerms: ["notice of award"] };
  check("an ignored subject is dropped even though it matched", !qualifies({ subject: "Notice of Award - RFP 2026-14" }, ignoring));
  check("...and an ordinary solicitation still passes", qualifies({ subject: "RFP 2026-15 issued" }, ignoring));

  // The ignore list reads the body too, which is the only way to exclude an
  // email that qualified on its footer rather than its subject.
  const disclaimer = { ...base, ignoreTerms: ["does not constitute a solicitation"] };
  check(
    "a disclaimer in the footer can be excluded",
    !qualifies(
      { subject: "Your monthly statement", body: "This communication does not constitute a solicitation to buy." },
      disclaimer,
    ),
  );
  check(
    "...without touching a real solicitation",
    qualifies({ subject: "RFP No. 2026-16 issued today" }, disclaimer),
  );
  // Which is exactly why the defaults are empty. An ignore term matched against
  // the body is a loaded gun, and "unsubscribe" is in every aggregator footer.
  check(
    "a careless ignore term does drop real mail, which is why none ship",
    !qualifies({ subject: "RFP No. 2026-16", body: "Click here to unsubscribe." }, { ...base, ignoreTerms: ["unsubscribe"] }),
  );

  check("the desk does not triage its own verdict emails", !qualifies({ subject: "Caravann RFP Desk: Go 84% - East Bay" }));
  check("an empty term list means everything qualifies", qualifies({ subject: "anything at all" }, { ...base, terms: [] }));
  check("nothing matching means it does not qualify", !qualifies({ subject: "Re: coffee next week", body: "no rush" }));
  // Always. An aggregator digest whose subject is "Weekly opportunities" and
  // whose body lists six solicitations is the case this exists for.
  check(
    "the body is always read",
    qualifies({ subject: "Weekly digest", body: "three new solicitations posted" }),
  );
  check("a term with regex characters does not throw", !qualifies({ subject: "hello" }, { ...base, terms: ["c++ (rfp"] }));

  // The identity check is what decides whether an email skips the screening
  // model. A term in the subject or on a file is the email announcing itself; a
  // term in a body is a word that may be about anything.
  const named = (e) => namedAsSolicitation(e, [...DEFAULT_SUBJECT_TERMS]);
  check("a term in the subject is a strong signal", named({ subject: "RFP No. 2026-14" }));
  check("a term on an attachment is a strong signal", named({ subject: "Please see attached", attachments: ["RFP 2026-14.pdf"] }));
  check(
    "a term only in the body is not, so it goes to be read",
    !named({ subject: "Your monthly statement", body: "does not constitute a solicitation to buy" }),
  );

  // Must be caught before the screening model, not by it. The verdict email
  // names a solicitation, quotes its score and discusses its deadline, so a
  // model reading it says yes to the wrong question.
  check("the desk recognises its own verdict email", sentByTheDesk({ subject: "Caravann RFP Desk: Go 84% - East Bay" }));
  check("...and an ordinary subject is not mistaken for one", !sentByTheDesk({ subject: "RFP No. 2026-14" }));
  check("a custom prefix still matches a longer word", qualifies({ subject: "Procurement notice" }, { ...base, terms: ["procure"] }));
}

console.log("\nDocument kind");
{
  const kind = (t) => classifyDocument(t);

  const rfp = kind(`REQUEST FOR PROPOSAL (RFP)
RFP NO.: 100120-FY27-09
I. PURPOSE
The Town is soliciting proposals. Scope of work: organizational review and strategic planning.`);
  check("an RFP is a solicitation", rfp.kind === "solicitation", rfp.kind);

  const addendum = kind(`ADDENDUM NO. 1
RFP No. 100120-FY27-09
The proposal due date is changed from September 3 to September 17.`);
  check("an addendum is recognised", addendum.kind === "addendum", addendum.kind);
  check("...and names the bid it amends", addendum.solicitationNumber === "100120-FY27-09", String(addendum.solicitationNumber));
  check("...and which one it is", addendum.sequence === 1, String(addendum.sequence));

  const qa = kind(`CLARIFYING QUESTIONS AND ANSWERS
RFP No. 100120-FY27-09
Q1: Is the thirty page limit inclusive of forms?
A1: No. The forms do not count toward the limit.`);
  check("an answer set is recognised", qa.kind === "clarifying_questions", qa.kind);
  check("...and attaches to the same bid", qa.solicitationNumber === "100120-FY27-09", String(qa.solicitationNumber));

  // A posting advertises a solicitation rather than containing one. Triaging
  // the advert scores the advert.
  const notice = kind(`Loudoun County Bid Board - New Posting
Solicitation number: 100120-FY27-09
The full solicitation document is attached as RFP-100120-FY27-09.pdf.`);
  check("a posting-board advert is a notice", notice.kind === "notice", notice.kind);
  check("...and says where the real document is", notice.attachmentName?.includes("RFP-100120-FY27-09.pdf"), String(notice.attachmentName));

  // "attached", not only "attachment". The plural-only pattern read the
  // commonest wording of the commonest notice as the solicitation itself.
  const attached = kind(`New posting
RFP No. 2026-14
The solicitation is attached as RFP 2026-14.pdf. Vendors should download it.`);
  check("a notice saying 'attached' is caught, not just 'attachment'", attached.kind === "notice", attached.kind);

  // Anything it cannot place stays a solicitation, which is what happened
  // before this existed.
  const odd = kind("Some document with no markers of any kind that runs on for a while.");
  check("anything unrecognised falls through to solicitation", odd.kind === "solicitation", odd.kind);
}

console.log("\nEdge case text");
{
  // Most cases are one sentence and must come through untouched.
  const plain = splitEdgeCase("Scored 70%, within two points of the 70% line - the same document could land either side of it on another run.");
  check("a one-sentence case is left alone", plain.items.length === 0 && plain.lead.startsWith("Scored 70%"));

  // The one that needed this. Fifteen obligations in a single paragraph is
  // something people skip, on the page whose whole job is deciding.
  const listed = splitEdgeCase(
    "2 mandatory requirements could not be confirmed from the document: Proposers shall have a minimum of seven (7) years of experience; At least one member shall hold a California license as an LCSW, LMFT, or Licensed Psychologist",
  );
  check("a requirement list is split out", listed.items.length === 2, `${listed.items.length} items`);
  check("...and the lead keeps its sentence", listed.lead === "2 mandatory requirements could not be confirmed from the document:", listed.lead);
  check("...and each item is trimmed", listed.items[0] === "Proposers shall have a minimum of seven (7) years of experience", listed.items[0]);
  check("...including the last, which carried the full stop", listed.items[1].endsWith("Licensed Psychologist"), listed.items[1]);

  // A colon inside requirement text must not be mistaken for the list marker.
  const colon = splitEdgeCase("Scored 68%, close to the line: read it yourself before deciding.");
  check("a colon in ordinary prose does not split", colon.items.length === 0, `${colon.items.length} items`);

  check("empty input does not throw", splitEdgeCase(null).lead === "");
  check("a lead with nothing after it stays whole",
    splitEdgeCase("1 mandatory requirement could not be confirmed from the document:").items.length === 0);
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

  // Generic words appear in every requirement and every roster entry, so after
  // stopword filtering "Must have experience providing services" carries no
  // significant term at all. Nobody matches it, and the honest answer is to
  // recommend nobody.
  //
  // This used to assert that a ranking came back regardless. That was written
  // before recommendTeam started withholding zero-score recommendations, and
  // the behaviour it was guarding is the one that caused the bug: on a
  // solicitation whose only extracted requirement was the gate reporting it
  // could not read the document, everyone tied at zero and the first three
  // names alphabetically were presented as the team.
  const generic = recommendTeam(members, [{ requirement_text: "Must have experience providing services", is_required: true }]);
  check(
    "a requirement with no significant terms recommends nobody, not everybody",
    generic.length === 0,
    `got ${generic.length}`
  );

  const atCapacity = recommendTeam(
    [{ ...members[0], bandwidth: "full" }],
    checks
  );
  check("someone at capacity still surfaces, scored lower", atCapacity.length === 1 && atCapacity[0].match_score < 100, String(atCapacity[0]?.match_score));

  check("empty roster returns nothing rather than throwing", recommendTeam([], checks).length === 0);
  // Same reasoning: nothing extracted means nothing to rank on. A panel that
  // says it has nothing to go on is actionable - get the real document - where
  // three arbitrary names are not.
  check("nothing extracted recommends nobody", recommendTeam(members, []).length === 0);
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
  // within a point - the median is well supported and the 58 is just a bad
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

  // A failed mandatory requirement is a gate, not a matter of degree - it
  // closes the bid no matter how much the reads disagreed.
  const gated = decideVerdict(88, [{ is_required: true, is_hard_knockout: true, result: "fail", requirement_text: "behavioral health" }], T, [30, 60, 90]);
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
    // Obfuscated spellings of 127.0.0.1 - the URL parser normalises these, so
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

  // A minimum qualification the solicitation says is disqualifying closes the
  // door regardless of overlap - the behavioral-health case that motivated the
  // whole product. It is marked by triage as a knockout, which is the reading
  // that matters: "must have three years" under a heading that says proposals
  // failing it are non-responsive, rather than the same words under evaluation
  // criteria where they cost points instead.
  const disqualifying = { ...requiredFail, is_hard_knockout: true };
  check("a disqualifying minimum beats a 99% score", decideVerdict(99, [disqualifying], T).status === "no_go");
  check("...and says which one", decideVerdict(99, [disqualifying], T).reason.includes("behavioral health"));

  // The same words, scored rather than disqualifying, do not close it.
  check("a stated 'must' that the RFP does not disqualify on is scored, not fatal",
    decideVerdict(78, [pass, requiredFail], T).status !== "no_go", decideVerdict(78, [pass, requiredFail], T).status);
  check("a hard knockout closes it even if not worded 'required'",
    decideVerdict(95, [{ is_required: false, is_hard_knockout: true, result: "fail" }], T).status === "no_go");

  // "Preferred" costs score, never the bid - the SOW is explicit about this.
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

  // A requirement you can satisfy before award is not a closed bid. Leesburg
  // RFP 100120-FY27-09 asks for eVA vendor registration and authorisation to
  // transact business in Virginia; both are afternoon errands. The word on the
  // page is "registered", not "registration", which the first version of
  // OBTAINABLE did not match - so the desk reported three fatal failures where
  // there was one, and would have closed a bid whose only gaps were paperwork.
  const registrations = [
    { requirement_text: "Offeror must be authorized to transact business in the Commonwealth of Virginia.", is_required: true, result: "fail" },
    { requirement_text: "Offeror must be a registered vendor in eVA, the Commonwealth's eProcurement portal.", is_required: true, result: "fail" },
  ];
  const paperworkOnly = decideVerdict(78, [pass, ...registrations]);
  check("registrations alone do not close a bid", paperworkOnly.status === "maybe", paperworkOnly.status);
  check("and registrations are not treated as gates at all", paperworkOnly.status === "maybe");

  const realGap = {
    requirement_text: "Must have significant experience in the management and delivery of local government services with direct knowledge and background in the Commonwealth of Virginia.",
    is_required: true,
    result: "fail",
  };
  const withGap = decideVerdict(78, [pass, realGap, ...registrations]);
  check("an experience gap the RFP scores does not close it", withGap.status !== "no_go", withGap.status);

  // A bond is disqualifying wherever it appears, without triage having to say so.
  const bonded = decideVerdict(95, [pass, { requirement_text: "A performance bond of 100% of the contract value is required.", is_required: true, result: "fail" }], T);
  check("a bond Caravann cannot post still closes it", bonded.status === "no_go", bonded.status);

  // "Not asked yet" is not "cannot comply". LA County CEO-RFSQ-AO-25-01 wants a
  // redacted sample work product beside each reference and one client able to
  // confirm it is genuine. Caravann has the references and has not yet asked
  // them; closing an 80% bid on its own paperwork not being done is the same
  // mistake as reading every "must" as a gate, one level further in.
  const notAskedYet = decideVerdict(80, [
    pass,
    { requirement_text: "Each reference must be accompanied by a sample work product.", is_required: true, is_hard_knockout: true, result: "unclear" },
  ], T);
  check("an unchecked mandatory requirement caps rather than closes", notAskedYet.status === "maybe", notAskedYet.status);
  check("...and names what would settle it", /sample work product/i.test(notAskedYet.reason));

  const cannotComply = decideVerdict(80, [
    pass,
    { requirement_text: "Each reference must be accompanied by a sample work product.", is_required: true, is_hard_knockout: true, result: "fail" },
  ], T);
  check("but a demonstrated failure still closes it", cannotComply.status === "no_go", cannotComply.status);

  // Determinism, stated as an assertion rather than assumed.
  const runs = new Set(Array.from({ length: 50 }, () => decideVerdict(83, [pass, preferredFail], T).status));
  check("50 identical inputs give exactly one answer", runs.size === 1, [...runs].join(","));
}

console.log(`\n${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  console.log("\nFailed:");
  failures.forEach((f) => console.log(`  ✗ ${f.name}${f.detail ? ` - ${f.detail}` : ""}`));
  process.exit(1);
}
