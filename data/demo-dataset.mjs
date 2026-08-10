// Demo dataset - realistic example data so the dashboard can be evaluated
// before real solicitations arrive.
//
// Every RFP here carries is_demo = true, which drives a warning banner on
// every page and an inline tag on every row. Purge with:
//   npm run seed:demo -- --purge
//
// The profile figures below are PLACEHOLDERS chosen to be plausible for a
// facilitation and strategic-planning firm. They are not Caravann's real
// numbers and must be replaced before any verdict is trusted - the notes
// field on each row says so, and it is visible in Settings.

export const DEMO_MARKER = "PLACEHOLDER - demo figure, replace with Caravann's real number";

export const DEMO_ORG_PROFILE = {
  bilingual_staff: false,
  media_production_capable: false,
  pr_capable: false,
  office_locations: ["Oakland, CA"],
  consultant_locations: ["Oakland, CA", "Sacramento, CA"],
  certifications: [],
  set_aside_status: [],
  notes:
    `${DEMO_MARKER}. Locations, capability flags, and certifications are all ` +
    `invented for demonstration. Certifications and set-aside status are left ` +
    `EMPTY on purpose: claiming a DBE/SBE status a firm does not hold can void ` +
    `a bid, so these must only ever be filled in from Caravann's actual ` +
    `certificates.`,
};

export const DEMO_SECTORS = [
  {
    sector: "Public agencies (general)",
    years_experience: 12,
    engagement_count: 34,
    notes: DEMO_MARKER,
  },
  {
    sector: "Public transit",
    years_experience: 8,
    engagement_count: 11,
    notes: `${DEMO_MARKER}. The SOW references real SamTrans work, so this sector is genuinely non-zero - the counts are still invented.`,
  },
  {
    sector: "K-12 education",
    years_experience: 4,
    engagement_count: 6,
    notes: `${DEMO_MARKER}. The SOW lists K-12 educator experience as something that has knocked Caravann out before, so real depth here is likely THINNER than shown.`,
  },
  {
    sector: "Higher education",
    years_experience: 6,
    engagement_count: 9,
    notes: DEMO_MARKER,
  },
  {
    sector: "Healthcare",
    years_experience: 3,
    engagement_count: 4,
    notes: DEMO_MARKER,
  },
  {
    sector: "Behavioral health",
    years_experience: 0,
    engagement_count: 0,
    notes:
      `Recorded as a genuine zero, not a placeholder. The SOW names behavioral ` +
      `health as a disqualifier that has knocked Caravann out of past RFPs. ` +
      `Confirm with Khaled whether this is a true zero or simply undocumented.`,
  },
  {
    sector: "Nonprofit",
    years_experience: 10,
    engagement_count: 22,
    notes: DEMO_MARKER,
  },
];

export const DEMO_TEAM = [
  { name: "Khaled El-Sawaf", role: "Principal / Lead Facilitator", rate: 285, bandwidth: "limited",
    qualifications: ["Lead facilitator", "Strategic planning", "Governing-body facilitation"] },
  { name: "A. Rivera", role: "Senior Consultant", rate: 210, bandwidth: "open",
    qualifications: ["Facilitation", "Stakeholder engagement"] },
  { name: "J. Okonkwo", role: "Consultant", rate: 165, bandwidth: "open",
    qualifications: ["Research", "Survey design"] },
  { name: "M. Chen", role: "Analyst", rate: 120, bandwidth: "full",
    qualifications: ["Data analysis", "Report production"] },
];

// Dates are expressed as day-offsets from seed time so the countdown colours
// (yellow inside 7 days, red inside 3) stay meaningful however long after
// seeding someone looks at the dashboard.
export const DEMO_RFPS = [
  {
    external_id: "DEMO-transit-strategic-plan",
    title: "Facilitation and Strategic Planning Services - 2027–2032 Strategic Plan",
    client_agency: "San Mateo County Transit District",
    project_type: "Strategic planning / facilitation",
    source: "aggregator",
    status: "go",
    score_percent: 92,
    budget_amount: 185000,
    budget_source: "rfp",
    due_in_days: 38,
    question_deadline_in_days: 9,
    verdict_why:
      "Core scope is board-and-stakeholder facilitation for a multi-year strategic plan - the centre of Caravann's service line. Transit-sector depth (8 yrs / 11 engagements) clears the three-comparable-engagement minimum with room to spare, and the $185K not-to-exceed is well matched to a 9-month facilitation engagement.",
    verdict_why_not:
      "No consultant currently based in San Mateo County; the RFP prefers but does not require local presence, so this costs points rather than disqualifying. Insurance certificate needs confirming against the $2M GL / $1M PL minimum before submission.",
    gaps: [
      { gap_type: "geography", description: "No consultant based in San Mateo County - RFP states local presence is preferred, not required." },
      { gap_type: "certification", description: "General Liability ($2M/occurrence) and Professional Liability ($1M) certificates not on file - confirm current coverage." },
    ],
    disqualifiers: [
      { requirement_text: "Minimum five (5) years providing facilitation services to public agencies", is_required: true, result: "pass", notes: "12 yrs recorded across public agencies." },
      { requirement_text: "Minimum three (3) comparable engagements with public transit agencies within the last seven years", is_required: true, result: "pass", notes: "11 transit engagements recorded." },
      { requirement_text: "Experience facilitating processes involving elected or appointed governing bodies", is_required: true, result: "pass" },
      { requirement_text: "Preferred: team member based in San Mateo County or immediate Bay Area", is_required: false, result: "fail", notes: "Oakland is Bay Area but outside San Mateo County - partial match, scored as a miss." },
    ],
    compliance: [
      { category: "deadline", label: "Proposal submission deadline", detail: "2:00 PM PT via agency e-procurement portal", due_in_days: 38 },
      { category: "deadline", label: "Written questions deadline", detail: "Email to procurement contact", due_in_days: 9 },
      { category: "page_limit", label: "Technical proposal limited to 25 pages", detail: "Resumes and required forms excluded from the count" },
      { category: "format", label: "12pt Times New Roman or Arial, 1-inch margins, single-sided" },
      { category: "submission", label: "Cost proposal as a SEPARATE sealed PDF", detail: "Including cost figures in the technical volume is grounds for rejection" },
      { category: "submission", label: "All three references merged into ONE PDF", detail: "Portal provides a single upload slot" },
      { category: "insurance", label: "GL $2M/occurrence, PL $1M, Auto $1M", detail: "Certificate required at contract execution, not at submission" },
      { category: "rubric", label: "Scoring: Experience 30, Approach 30, Team 20, Cost 20" },
    ],
    questions: [
      { lane: "public_memo", question_text: "Is the $185,000 not-to-exceed figure fixed, or negotiable based on proposed scope?" },
      { lane: "public_memo", question_text: "Is subcontracting permitted for the local-presence preference, and would a subcontractor based in San Mateo County satisfy it?" },
      { lane: "public_memo", question_text: "Is a time-and-materials structure acceptable, or is a firm-fixed-price required?" },
      { lane: "incumbent_request", question_text: "Under the Public Records Act, may we obtain a copy of the winning proposal from the District's most recent strategic-planning solicitation?" },
    ],
  },
  {
    external_id: "DEMO-behavioral-health",
    title: "Behavioral Health Continuum of Care - Stakeholder Engagement and Planning",
    client_agency: "Riverside County Behavioral Health",
    project_type: "Stakeholder engagement",
    source: "aggregator",
    status: "no_go",
    score_percent: 18,
    budget_amount: 240000,
    budget_source: "rfp",
    due_in_days: 24,
    question_deadline_in_days: 4,
    verdict_why:
      "Budget is healthy and the facilitation mechanics are within Caravann's competence.",
    verdict_why_not:
      "Section 4.2 requires a minimum of five years of direct behavioral health system experience and a licensed clinician on the engagement team. Caravann records zero behavioral health engagements and has no clinical staff. This is a hard knockout, not a scoring penalty - the requirement is stated as mandatory.",
    gaps: [
      { gap_type: "sector", description: "Zero behavioral health engagements on record; RFP requires 5+ years direct sector experience." },
      { gap_type: "staffing", description: "No licensed behavioral health clinician on staff - required as a named team member." },
    ],
    disqualifiers: [
      { requirement_text: "Minimum five (5) years direct behavioral health system experience", is_required: true, result: "fail", is_hard_knockout: true, notes: "Zero recorded. Confirmed dealbreaker per Caravann's own history." },
      { requirement_text: "Licensed behavioral health clinician named on the engagement team", is_required: true, result: "fail", is_hard_knockout: true },
      { requirement_text: "Minimum three (3) years facilitating multi-agency public processes", is_required: true, result: "pass" },
    ],
    compliance: [
      { category: "deadline", label: "Proposal submission deadline", due_in_days: 24 },
      { category: "deadline", label: "Written questions deadline", due_in_days: 4 },
      { category: "rubric", label: "Scoring: Sector experience 40, Approach 25, Team 25, Cost 10", detail: "Sector experience is the single heaviest category - a structural disadvantage here." },
    ],
    questions: [],
  },
  {
    external_id: "DEMO-k12-omaha",
    title: "Strategic Plan Facilitation - District Equity and Access Plan",
    client_agency: "Omaha Public Schools",
    project_type: "Strategic planning / facilitation",
    source: "aggregator",
    status: "maybe",
    score_percent: 61,
    budget_amount: 95000,
    budget_source: "qa_document",
    due_in_days: 5,
    question_deadline_in_days: -2,
    verdict_why:
      "Facilitation scope is a clean match and the district's process mirrors work Caravann has done for other public agencies. K-12 depth (4 yrs / 6 engagements) clears the stated three-year minimum.",
    verdict_why_not:
      "Two soft misses that compound: no team member based in Omaha (preferred, not required) and K-12 depth is thin relative to likely competitors. The question window has already closed, so the local-presence and subcontracting questions can no longer be asked. Budget appears only in the agency Q&A document, not the RFP itself.",
    gaps: [
      { gap_type: "geography", description: "No consultant based in Omaha or the surrounding metro - RFP states a local team member is preferred." },
      { gap_type: "sector", description: "K-12 depth (4 yrs / 6 engagements) is thin against districts that typically attract education-specialist firms." },
    ],
    disqualifiers: [
      { requirement_text: "Minimum three (3) years facilitating strategic planning for K-12 districts", is_required: true, result: "pass", notes: "4 yrs recorded - clears, but narrowly." },
      { requirement_text: "Preferred: at least one team member based in the Omaha metropolitan area", is_required: false, result: "fail" },
      { requirement_text: "Experience with equity-focused planning processes", is_required: true, result: "pass" },
    ],
    compliance: [
      { category: "deadline", label: "Proposal submission deadline", detail: "4:00 PM CT, hand delivery or courier - no electronic submission", due_in_days: 5 },
      { category: "deadline", label: "Written questions deadline", detail: "CLOSED - window has already passed", due_in_days: -2 },
      { category: "page_limit", label: "Narrative limited to 15 pages" },
      { category: "submission", label: "Six (6) hard copies plus one USB drive", detail: "No electronic submission accepted - courier lead time matters" },
      { category: "rubric", label: "Scoring: Approach 35, Experience 30, Cost 25, Local presence 10" },
    ],
    questions: [
      { lane: "public_memo", question_text: "Would a subcontracted facilitator based in the Omaha metro satisfy the local-presence preference?", status: "drafted" },
    ],
  },
  {
    external_id: "DEMO-university-governance",
    title: "Shared Governance Review and Facilitation Services",
    client_agency: "California State University, East Bay",
    project_type: "Organizational review / facilitation",
    source: "email",
    status: "go",
    score_percent: 84,
    budget_amount: null,
    budget_source: "none_listed",
    due_in_days: 16,
    question_deadline_in_days: 2,
    verdict_why:
      "Shared-governance facilitation sits squarely in Caravann's higher-education line (6 yrs / 9 engagements), and the Oakland office is within reasonable distance of the Hayward campus for on-site sessions.",
    verdict_why_not:
      "No budget figure appears anywhere in the solicitation, so effort-versus-value cannot be assessed before pricing. The question deadline is in two days - if a budget range is going to be asked for, it has to be asked now.",
    gaps: [
      { gap_type: "other", description: "No budget disclosed in the RFP - pricing lane (premium vs tight) cannot be determined without asking." },
    ],
    disqualifiers: [
      { requirement_text: "Demonstrated experience with higher education shared governance structures", is_required: true, result: "pass" },
      { requirement_text: "Minimum five (5) years organizational consulting experience", is_required: true, result: "pass" },
    ],
    compliance: [
      { category: "deadline", label: "Proposal submission deadline", due_in_days: 16 },
      { category: "deadline", label: "Written questions deadline", detail: "Closes in 2 days - the budget question must go out before this", due_in_days: 2 },
      { category: "page_limit", label: "Proposal limited to 20 pages including appendices" },
      { category: "insurance", label: "GL $1M/occurrence minimum" },
    ],
    questions: [
      { lane: "public_memo", question_text: "Has the University established a budget range or not-to-exceed amount for this engagement?" },
      { lane: "public_memo", question_text: "Is the expectation of on-campus facilitation sessions, remote, or hybrid - and how many sessions are anticipated?" },
      { lane: "incumbent_request", question_text: "Is there an incumbent consultant currently supporting shared governance review, and may we review the prior scope of work?" },
    ],
  },
  {
    external_id: "DEMO-water-district",
    title: "Board Retreat Facilitation and Strategic Priorities Workshop",
    client_agency: "Santa Clara Valley Water District",
    project_type: "Workshop / retreat facilitation",
    source: "aggregator",
    status: "go",
    score_percent: 88,
    budget_amount: 45000,
    budget_source: "rfp",
    due_in_days: 2,
    question_deadline_in_days: -6,
    verdict_why:
      "Small, well-defined board-retreat facilitation - exactly the shape of engagement Caravann delivers repeatedly for public agencies (12 yrs / 34 engagements). Low effort relative to the $45K budget.",
    verdict_why_not:
      "Deadline is in two days. The question window closed six days ago. This is submittable only if the team can move immediately.",
    gaps: [],
    disqualifiers: [
      { requirement_text: "Minimum three (3) years facilitating public-agency board sessions", is_required: true, result: "pass" },
      { requirement_text: "References from at least two California public agencies", is_required: true, result: "pass" },
    ],
    compliance: [
      { category: "deadline", label: "Proposal submission deadline", detail: "5:00 PM PT - email submission accepted", due_in_days: 2 },
      { category: "page_limit", label: "Ten (10) page maximum" },
      { category: "submission", label: "Single PDF, email to the procurement contact" },
    ],
    questions: [],
  },
  {
    external_id: "DEMO-pending-triage",
    title: "Community Engagement Services - General Plan Update",
    client_agency: "City of Fremont",
    project_type: "Community engagement",
    source: "email",
    status: "pending",
    score_percent: null,
    budget_amount: null,
    budget_source: "none_listed",
    due_in_days: 45,
    question_deadline_in_days: 18,
    verdict_why: null,
    verdict_why_not: null,
    gaps: [],
    disqualifiers: [],
    compliance: [],
    questions: [],
  },
];

// ── Approved-language library (module 8) ─────────────────────────────────────
// Placeholder text in Caravann's register, NOT their real proposal language.
// Real blocks come from their past submissions - that is the whole point of
// the library, and why nothing writes to this table automatically.
export const DEMO_LANGUAGE_BLOCKS = [
  {
    section_type: "cover_letter",
    title: "Standard cover letter opening",
    body: `Dear Selection Committee,\n\nCaravann Consulting is pleased to submit this proposal for {{ENGAGEMENT}} on behalf of {{CLIENT}}. We have read the solicitation in full, including all addenda issued to date, and confirm our ability to meet the requirements and the {{DUE_DATE}} timeline.\n\nOur practice is built on a single premise: a plan people helped write is a plan they will carry out. We would welcome the opportunity to bring that to {{CLIENT}}.`,
    source: "Placeholder - replace with Caravann's own cover letter",
    won: false,
  },
  {
    section_type: "firm_profile",
    title: "Firm overview",
    body: `Caravann Consulting is an organizational consulting practice working with public agencies, universities, healthcare systems, and corporations. We specialize in facilitation, strategic planning, and human-centered change management.\n\nOur work is distinguished by process design that produces decisions rather than documents, and by facilitation that holds a room of competing interests without flattening the disagreement that makes a plan durable.`,
    source: "Placeholder - drawn from caravann.co positioning",
    won: false,
    is_boilerplate: true,
  },
  {
    section_type: "approach",
    title: "Four-phase facilitation methodology",
    body: `Our approach to {{PROJECT_TYPE}} proceeds in four phases.\n\nDiscovery. We review existing plans, performance data, and prior engagement efforts, and interview leadership and a cross-section of staff to surface what the organization already knows about itself.\n\nEngagement. We design and facilitate sessions calibrated to each audience - governing body, staff, and public - so that participation is genuine rather than ceremonial.\n\nSynthesis. We return what we heard, including where it conflicts, and work with leadership to make the trade-offs explicit rather than deferring them.\n\nAdoption. We deliver a plan written to be used: specific owners, measurable commitments, and a review cadence the organization can sustain.`,
    source: "Placeholder - replace with the real methodology section",
    won: true,
  },
  {
    section_type: "relevant_experience",
    title: "Public agency facilitation experience",
    body: `Caravann has facilitated strategic planning and organizational review processes for public agencies including transit districts, county departments, and municipal governments. These engagements share the characteristics {{CLIENT}} describes: multiple stakeholder groups with competing priorities, an elected or appointed governing body that must ultimately adopt the plan, and a public record obligation throughout.`,
    source: "Placeholder - replace with named engagements and outcomes",
    won: true,
  },
  {
    section_type: "references",
    title: "Reference format note",
    body: `References are provided on the following page in the format requested by the solicitation. Where the portal accepts only a single upload, all references are merged into one PDF in the order listed.`,
    source: "Placeholder",
    won: false,
    is_boilerplate: true,
  },
];

// ── Edge cases awaiting review (module 11) ───────────────────────────────────
export const DEMO_EDGE_CASES = [
  {
    description:
      'A solicitation listed "bilingual facilitation capability" under Desirable Qualifications but the evaluation rubric scored it at 15 points - heavier than some stated minimums. Triage treated it as a preference and scored it as a minor miss.',
    proposed_rule_change:
      "When a preference carries 10 or more rubric points, weight it like a requirement in the score even though it does not hard-gate.",
  },
  {
    description:
      "An addendum moved the question deadline forward by a week. The original deadline was already on the compliance checklist and was not updated, so the countdown was wrong for two days.",
    proposed_rule_change:
      "Re-run compliance extraction whenever an addendum is filed, and mark superseded deadlines rather than leaving both.",
  },
];

export const DEMO_PORTAL_RULES = [
  { portal_name: "PlanetBids", rule_text: "References must be merged into a single PDF - only one upload slot is provided." },
  { portal_name: "Omaha Public Schools", rule_text: "Resumes are excluded from the narrative page count; confirm before trimming." },
  { portal_name: "SamTrans e-procurement", rule_text: "Cost proposal must be a separate sealed PDF. Cost figures in the technical volume are grounds for rejection." },
];
