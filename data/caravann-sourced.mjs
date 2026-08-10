/**
 * Caravann data taken from Caravann's own documents — not invented.
 *
 * Everything in `data/demo-dataset.mjs` is a plausible placeholder, and it says
 * so. This file is the opposite: every entry below is traceable to a real
 * source, cited per record in `SOURCES`. The two must not be confused, which is
 * why they are separate files with separate seed scripts.
 *
 * The rule applied throughout: transcribe, never infer. Where the source is
 * ambiguous the field is left empty for Khaled rather than filled with a good
 * guess — an invented number that looks confident is exactly the failure this
 * whole system was built to stop.
 *
 * Notably NOT filled in from these sources, because they are not in them:
 *   · years and engagement counts per sector
 *   · certifications and set-aside status
 *   · insurance carrier and limits
 *   · consultant locations, bilingual / media / PR capability
 *   · per-person rates, bandwidth and roles (only Khaled's role is stated)
 */

export const SOURCES = {
  ucsf:
    "UCSF IGHS Needs Assessment & Strategic Plan x Caravann (Google Slides, Sept 2024) — Caravann's own proposal deck",
};

/**
 * The full team as Caravann presents it to a client.
 *
 * Thirteen names, replacing three invented ones ("A. Rivera", "J. Okonkwo",
 * "M. Chen") that were placeholders from the demo seed.
 *
 * The deck pairs each person with a descriptor ("the happiness researcher",
 * "the visuals virtuoso", and so on), but the slide's extracted text lists all
 * the names and then all the descriptors, so the pairing is not recoverable
 * with certainty. Rather than guess which label belongs to whom — and put words
 * in a named real person's mouth — roles are left blank for Khaled to fill. The
 * descriptors are recorded once, unattributed, in TEAM_DESCRIPTORS below.
 */
export const SOURCED_TEAM = [
  { name: "Khaled El-Sawaf", role: "Principal / Lead Facilitator", qualifications: ["Lead facilitator", "Strategic planning", "Governing-body facilitation"] },
  { name: "Kia Afcari", role: null, qualifications: [] },
  { name: "Emiliana Simon-Thomas", role: null, qualifications: [] },
  { name: "Terrell Holmes", role: null, qualifications: [] },
  { name: "DB Bedford", role: null, qualifications: [] },
  { name: "Crystal Fullwood", role: null, qualifications: [] },
  { name: "Deb Samuel", role: null, qualifications: [] },
  { name: "Sarah Lightfoot", role: null, qualifications: [] },
  { name: "Brenda Goodwin", role: null, qualifications: [] },
  { name: "Trudie Mitschang", role: null, qualifications: [] },
  { name: "Isabel Gabaldon", role: null, qualifications: [] },
  { name: "Priscilla Kwok", role: null, qualifications: [] },
  { name: "Trent Wakenight", role: null, qualifications: [] },
];

/** Recorded verbatim, unattributed, so the information is not lost while the
 *  name-to-descriptor mapping stays honest about being unknown. */
export const TEAM_DESCRIPTORS = [
  "The happiness researcher",
  "The comms & engagement guru",
  "The strategy, culture & DEI dude",
  "The Org. Dev. professor",
  "The “EI Guy”",
  "The wellness expert",
  "The Org Psych. and burnout specialist",
  "The Org. Dev. and facilitation aficionado",
  "The wise coach",
  "The change and comms champion",
  "The cross-functional dynamo",
  "The discerning designer",
  "The visuals virtuoso",
];

/**
 * Proposal language in Caravann's own words, replacing the five generic blocks
 * the demo seed wrote. These are what the proposal assembler should be drawing
 * on — the difference between a draft that sounds like Caravann and one that
 * sounds like a template.
 */
export const SOURCED_LANGUAGE_BLOCKS = [
  {
    section_type: "methodology",
    title: "Four-phase needs assessment and strategic planning approach",
    body: [
      "Our approach proceeds in four phases.",
      "",
      "1. Design and implement a needs assessment to gain insights into the current and desired state. We work with the project team to clarify the key research questions the assessment should answer, then design and conduct interviews, focus groups and surveys. Deliverables: a stakeholder map determining who to speak with, learning objectives for each stakeholder group, and the design and results of surveys, focus groups and 1:1 interviews.",
      "",
      "2. Generate an insights report summarising themes, key findings and an engagement plan. We use human and artificial intelligence to analyse and summarise the research, and create a visual engagement plan charting each stakeholder group's interest against its influence. Deliverables: a comprehensive Insights Report with both detailed and executive summaries, an engagement plan per stakeholder group, and the raw data table.",
      "",
      "3. Design and facilitate a comprehensive strategic planning process. This includes a change management and communication plan, the creation of a representative Strategic Planning Committee, and a set of benchmarks and targets to measure progress. Deliverables: facilitated sessions to align the roadmap — a north star, strategic imperatives, and 'we statements' specifying the behaviours needed to execute the strategy — plus a draft visual graphic of the roadmap and an outline of the full plan.",
      "",
      "4. Facilitate the composition of the written strategic plan to completion. We facilitate sessions to compile the plan's elements, bring it to completion, and provide team structure recommendations. Deliverables: a completed strategic plan, a completed roadmap, and team structure recommendations.",
    ].join("\n"),
    is_boilerplate: false,
  },
  {
    section_type: "approach",
    title: "What you can expect from us",
    body: [
      "Start from the positive core.",
      "Radical candor.",
      "The client is the hero.",
      "Responsive partnering to achieve impact.",
    ].join("\n"),
    is_boilerplate: true,
  },
  {
    section_type: "capabilities",
    title: "Consulting services and key capabilities",
    body: [
      "Define Strategy for Winning — what are the deliberate bets we are making that will help us win in the marketplace?",
      "",
      "Design culture that activates strategy — what are the behaviours we need in order to meet our strategy?",
      "",
      "Embed DEI into company DNA — how can we ensure everything we do is through a lens of diversity, equity, inclusion, belonging and justice?",
      "",
      "Enlightened leadership — emotional intelligence, executive coaching, and prosocial behaviours.",
      "",
      "Each engagement moves through the same client journey: Assessment, Articulation, Activation, Review.",
    ].join("\n"),
    is_boilerplate: true,
  },
  {
    section_type: "experience",
    title: "Higher education and global health — UCSF IGHS",
    body: [
      "Caravann designed and facilitated a needs assessment and four-to-five-year strategic plan for the UCSF Institute for Global Health Sciences, an institute of seven centres facing fragmentation across the wider university and a rapidly changing global health funding landscape.",
      "",
      "The engagement ran from September 2024 to May 2025 across four phases: needs assessment, insights report and engagement plan, facilitated strategic planning with a representative Strategic Planning Committee, and composition of the written plan to completion — concluding with team structure recommendations to support the institute's future direction.",
    ].join("\n"),
    is_boilerplate: false,
    won: true,
  },
];

/**
 * A real engagement's phase-level pricing, useful as the reference point for
 * "does the stated budget cover the effort this scope implies?" — the rubric
 * dimension that currently has nothing concrete to anchor against.
 */
export const SOURCED_ENGAGEMENT_BENCHMARK = {
  client: "UCSF Institute for Global Health Sciences",
  scope: "Needs assessment and 4–5 year strategic plan, four phases, Sept 2024 – May 2025",
  total: 154125,
  phases: [
    { phase: "Needs assessment", fee: 43125 },
    { phase: "Insights report and engagement plan", fee: 21375 },
    { phase: "Strategic planning process", fee: 60375 },
    { phase: "Composition of the written plan", fee: 29250 },
  ],
};
