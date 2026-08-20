// Test solicitations for the triage prompt. Each one carries a specific trap
// the SOW names as a real failure mode for Caravann, with a known-correct
// verdict so test-triage.mjs can assert rather than eyeball.
//
// Deliberately synthetic: a random real PDF gives no ground truth to check
// against. These are written to read like the real thing - the disqualifier
// is buried deep, the budget hides where it hides, and the submission
// mechanics trap sits in a paragraph nobody reads.

export const CARAVANN_CONTEXT = {
  org_profile: {
    bilingual_staff: true,
    media_production_capable: false,
    pr_capable: false,
    office_locations: ["Los Angeles, CA"],
    consultant_locations: ["Los Angeles, CA", "Sacramento, CA", "Portland, OR"],
    certifications: ["SBE"],
    set_aside_status: [],
    notes:
      "Facilitation, strategic planning, organizational change, stakeholder engagement. No clinical/behavioral health practice.",
  },
  sector_experience: [
    { sector: "transit", years_experience: 9, engagement_count: 14, notes: "SamTrans, LA Metro, AC Transit" },
    { sector: "public agencies", years_experience: 12, engagement_count: 31, notes: null },
    { sector: "K-12", years_experience: 2, engagement_count: 3, notes: "Two district strategic plans, no classroom educator on staff" },
    { sector: "behavioral health", years_experience: 0, engagement_count: 0, notes: "No experience" },
  ],
  portal_rules: [
    { portal_name: "PlanetBids", rule_text: "References must be merged into a single PDF - the portal exposes only one upload slot." },
  ],
};

export const FIXTURES = [
  {
    // Named for what it was written to test, and the expectation now reflects
    // the firm rather than an imagined one.
    //
    // This fixture demands "three (3) comparable engagements with public
    // transit agencies within seven years". Caravann has one: the San
    // Francisco County Transportation Authority. While the harness scored
    // against a checked-in context snapshot that answer never surfaced;
    // scoring against the live profile, the desk closes the bid, and it is
    // right to. Experience is not something you obtain before Friday.
    //
    // The insurance line in this fixture also fails - it asks for $2M per
    // occurrence against the $1M recorded - and that one no longer closes
    // anything, because a shortfall an endorsement cures before award is a
    // condition of award and not of bidding. See lib/verdict.ts.
    //
    // If Khaled adds transit engagements, revisit this: the fixture is meant
    // to represent a bid that should sail through.
    name: "transit-facilitation (expect NO_GO - one transit engagement, three required)",
    external_id: "test-transit-facilitation-001",
    expect: {
      status: "no_go",
      budget_source: "rfp",
      budget_amount: 185000,
      mustFlagCompliance: /single|one file|merged|combined/i,
      minScore: 40,
    },
    text: `
REQUEST FOR PROPOSALS No. 2026-114
SAN MATEO COUNTY TRANSIT DISTRICT (SamTrans)
FACILITATION AND STRATEGIC PLANNING SERVICES

1. INTRODUCTION
The San Mateo County Transit District ("District") is soliciting proposals from qualified
consulting firms to provide facilitation and strategic planning services in support of the
District's 2027-2032 Strategic Plan development.

2. SCOPE OF SERVICES
The selected Consultant shall: (a) design and facilitate a series of eight (8) stakeholder
workshops with District staff, the Board of Directors, and community partners;
(b) synthesize workshop output into a draft strategic framework; (c) facilitate two (2)
Board study sessions; and (d) deliver a final Strategic Plan document.

3. MINIMUM QUALIFICATIONS
Proposers must demonstrate:
3.1 A minimum of five (5) years of experience providing facilitation services to public
    agencies.
3.2 A minimum of three (3) comparable engagements with public transit agencies within
    the last seven (7) years.
3.3 Evidence of experience facilitating multi-stakeholder processes involving elected or
    appointed governing bodies.
3.4 It is preferred that the proposing team include at least one consultant based in
    San Mateo County or the immediate Bay Area.
3.5 Proposers shall carry General Liability insurance of not less than $2,000,000 per
    occurrence and Professional Liability of not less than $1,000,000.

4. BUDGET
The District has established a not-to-exceed amount of $185,000 for the full term of this
engagement, inclusive of all labor, travel, and direct expenses.

5. SUBMISSION REQUIREMENTS
5.1 Proposals shall not exceed thirty (30) pages, excluding resumes, the cost proposal,
    and required forms.
5.2 Text shall be no smaller than 11-point Times New Roman or equivalent, with margins
    of not less than one (1) inch.
5.3 The Cost Proposal (Attachment C) shall be submitted as a SEPARATE PDF file and shall
    not be included within the technical proposal.
5.4 Proposers shall provide three (3) client references. NOTE: The District's electronic
    procurement portal (PlanetBids) provides a single file upload field for references.
    Proposers must therefore combine all three reference forms into one consolidated PDF
    prior to upload. Proposals submitted with fewer than three references in the
    consolidated file will be deemed non-responsive.
5.5 All proposals must be received via the PlanetBids portal no later than
    3:00 p.m. Pacific Time on October 14, 2026. Late proposals will not be accepted.

6. QUESTIONS
Questions regarding this RFP must be submitted in writing to the Contract Administrator,
Diane Whitmore (dwhitmore@samtrans.example.gov), no later than 5:00 p.m. Pacific Time on
September 18, 2026. Responses will be issued by addendum.

7. EVALUATION CRITERIA
Proposals will be evaluated as follows:
  Understanding of Scope and Approach ................. 30 points
  Relevant Experience and Past Performance ............ 30 points
  Qualifications of Key Personnel ..................... 20 points
  Cost .................................................. 20 points
The District reserves the right to negotiate final pricing with the highest-ranked
proposer prior to award.
`,
  },

  {
    name: "behavioral-health (expect NO_GO - buried hard disqualifier)",
    external_id: "test-behavioral-health-002",
    expect: {
      status: "no_go",
      budget_source: "none_listed",
      budget_amount: null,
      mustFailRequirement: /behavioral health|clinical|licensed/i,
      mustGapType: "sector",
    },
    text: `
REQUEST FOR PROPOSALS
COUNTY OF STANISLAUS - BEHAVIORAL HEALTH AND RECOVERY SERVICES
RFP #BHRS-2026-08
ORGANIZATIONAL ASSESSMENT AND STAFF FACILITATION SERVICES

SECTION 1 - PURPOSE
Stanislaus County Behavioral Health and Recovery Services (BHRS) seeks a qualified
consultant to conduct an organizational assessment and facilitate a series of staff
engagement sessions across its outpatient service divisions.

SECTION 2 - BACKGROUND
BHRS operates twelve outpatient clinics serving approximately 14,000 clients annually.
The Department has experienced significant turnover in clinical supervisory roles and
seeks external support in assessing organizational structure and facilitating staff
input into a restructuring plan.

SECTION 3 - SCOPE OF WORK
3.1 Conduct an organizational assessment of BHRS outpatient divisions.
3.2 Facilitate no fewer than fifteen (15) staff engagement sessions.
3.3 Deliver a written assessment with restructuring recommendations.
3.4 Present findings to the Board of Supervisors.

SECTION 4 - TERM
The initial term shall be twelve (12) months from Notice to Proceed, with two (2)
optional one-year extensions at the County's sole discretion.

SECTION 5 - PROPOSER QUALIFICATIONS
5.1 Proposers shall have a minimum of seven (7) years of experience conducting
    organizational assessments for public sector clients.
5.2 Proposers shall demonstrate experience facilitating group processes with
    professional staff.
5.3 Bilingual (English/Spanish) facilitation capability is preferred given the
    Department's service population.
5.4 The proposing firm SHALL demonstrate a minimum of three (3) years of direct
    experience working within behavioral health or community mental health service
    settings. Proposers without documented behavioral health sector experience will
    not be considered responsive. The County will not accept general public-sector
    experience in satisfaction of this requirement.
5.5 At least one member of the proposed team shall hold, or have previously held, a
    California license as an LCSW, LMFT, or Licensed Psychologist.

SECTION 6 - COMPENSATION
Compensation shall be negotiated with the successful proposer based on the proposed
scope and staffing plan. Proposers shall submit a fully burdened rate schedule with
their cost proposal.

SECTION 7 - SUBMISSION
7.1 Proposals are limited to twenty-five (25) pages exclusive of appendices.
7.2 Submit one (1) electronic copy in PDF format to purchasing@stancounty.example.gov.
7.3 Deadline for submission: November 3, 2026, 4:00 p.m.
7.4 Written questions are due October 10, 2026.

SECTION 8 - INSURANCE
Successful proposer shall maintain Professional Liability coverage of $1,000,000 per
claim and Commercial General Liability of $1,000,000 per occurrence.
`,
  },

  {
    name: "k12-omaha (expect MAYBE - thin depth + preferred-local miss, budget in Q&A)",
    external_id: "test-k12-omaha-003",
    expect: {
      status: "maybe",
      budget_source: "qa_document",
      budget_amount: 95000,
      mustGapType: "geography",
      maxScore: 85,
    },
    text: `
OMAHA PUBLIC SCHOOLS
REQUEST FOR PROPOSAL RFP 26-047
STRATEGIC PLANNING FACILITATION SERVICES

PART I - GENERAL INFORMATION
Omaha Public Schools ("District") requests proposals from qualified firms to facilitate
the development of the District's 2027-2031 Strategic Plan, including community
engagement sessions and Board work sessions.

PART II - SCOPE
The Contractor shall facilitate up to twelve (12) community engagement sessions across
District attendance areas, three (3) Board of Education work sessions, and produce a
final strategic plan document with implementation milestones.

PART III - MINIMUM REQUIREMENTS
A. Proposer shall have not less than three (3) years of experience providing strategic
   planning facilitation to public sector or educational institutions.
B. Proposer shall demonstrate experience conducting community engagement in
   multilingual settings. The District's families speak more than forty languages;
   Spanish-language facilitation capability is required.
C. It is strongly preferred that the proposing team include at least one team member
   located in the Omaha metropolitan area to support in-person session delivery.
   Proposals from firms without local presence will be considered but may be scored
   lower under Criterion 4.
D. Prior experience with K-12 public school district strategic planning is preferred.

PART IV - COMPENSATION
The District has not established a published not-to-exceed amount in this solicitation.
Proposers shall submit a cost proposal reflecting their proposed level of effort.

PART V - SUBMISSION REQUIREMENTS
A. Proposals shall not exceed forty (40) pages including all attachments and resumes.
   NOTE: unlike many solicitations, resumes DO count against the page limit.
B. Font shall be Arial 11pt minimum.
C. Proposals due December 8, 2026 at 2:00 p.m. Central Time.
D. Questions due November 12, 2026.
E. Submit via email to procurement@ops.example.org.

PART VI - EVALUATION
Criterion 1 - Approach and Methodology ............ 35%
Criterion 2 - Firm Experience ..................... 25%
Criterion 3 - Personnel Qualifications ............ 20%
Criterion 4 - Local Presence and Availability ..... 10%
Criterion 5 - Cost ................................ 10%

--- ATTACHED: ADDENDUM NO. 1 - WRITTEN QUESTIONS AND ANSWERS ---

Q1: Will the District consider proposals from firms located outside Nebraska?
A1: Yes. Local presence is preferred and scored under Criterion 4 but is not a
    disqualifying requirement.

Q2: Can the District share a budget range for this engagement?
A2: The District anticipates a total contract value of approximately $95,000 for the
    full scope described in Part II. Proposers should size their level of effort
    accordingly.

Q3: Is subcontracting permitted?
A3: Yes, provided all subcontractors are identified in the proposal.
`,
  },
];
