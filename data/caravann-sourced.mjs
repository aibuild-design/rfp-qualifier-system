/**
 * Caravann data taken from Caravann's own documents - not invented.
 *
 * Everything in `data/demo-dataset.mjs` is a plausible placeholder, and it says
 * so. This file is the opposite: every entry below is traceable to a real
 * source, cited per record in `SOURCES`. The two must not be confused, which is
 * why they are separate files with separate seed scripts.
 *
 * The rule applied throughout: transcribe, never infer. Where the source is
 * ambiguous the field is left empty for Khaled rather than filled with a good
 * guess - an invented number that looks confident is exactly the failure this
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
  samtrans:
    "SamTrans RFP Estimated Hours and Cost (xlsx) - Caravann's own pricing sheet for the San Mateo County Transit District bid",
  ucsf:
    "UCSF IGHS Needs Assessment & Strategic Plan x Caravann (Google Slides, Sept 2024) - Caravann's own proposal deck",
};

/**
 * The full team as Caravann presents it to a client.
 *
 * Thirteen names, replacing three invented ones ("A. Rivera", "J. Okonkwo",
 * "M. Chen") that were placeholders from the demo seed.
 *
 * Each person's descriptor is now attached. The first pass read this slide as
 * plain extracted text, which lists every name and then every label with no way
 * to pair them, so they were deliberately left unattributed. The PDF renders the
 * slide properly - each label sits beside its portrait with an arrow - so the
 * pairing is recoverable after all.
 *
 * These are self-descriptions from a client-facing deck, not job titles. They
 * go in `qualifications` where they say something about capability and are left
 * out where they are purely affectionate.
 */
export const SOURCED_TEAM = [
  { name: "Khaled El-Sawaf", role: "Principal / Lead Facilitator", qualifications: ["Lead facilitator", "Strategic planning", "Governing-body facilitation"] },
  { name: "Kia Afcari", role: "Strategy, culture and DEI", qualifications: ["Strategy", "Culture transformation", "DEI"] },
  { name: "Terrell Holmes", role: "Organisational development", qualifications: ["Organisational development"] },
  { name: "Emiliana Simon-Thomas", role: "Happiness research", qualifications: ["Wellbeing research", "Prosocial behaviour"] },
  { name: "Crystal Fullwood", role: "Wellness", qualifications: ["Mental health and wellbeing"] },
  { name: "Deb Samuel", role: "Organisational psychology", qualifications: ["Organisational psychology", "Burnout"] },
  { name: "Sarah Lightfoot", role: "Organisational development and facilitation", qualifications: ["Organisational development", "Group facilitation"] },
  { name: "DB Bedford", role: "Emotional intelligence", qualifications: ["Emotional intelligence", "Executive coaching"] },
  { name: "Brenda Goodwin", role: "Coaching", qualifications: ["Executive coaching"] },
  { name: "Trent Wakenight", role: "Visuals", qualifications: ["Graphic recording", "Graphic facilitation"] },
  { name: "Priscilla Kwok", role: "Design", qualifications: ["Design"] },
  { name: "Isabel Gabaldon", role: "Cross-functional delivery", qualifications: [] },
  { name: "Trudie Mitschang", role: "Change and communications", qualifications: ["Change management", "Communication strategy"] },
];

/** The deck's own affectionate labels, kept verbatim for the proposal writer -
 *  they are part of how Caravann presents itself and are better material than
 *  anything paraphrased. */
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
 * on - the difference between a draft that sounds like Caravann and one that
 * sounds like a template.
 */
export const SOURCED_LANGUAGE_BLOCKS = [
  {
    section_type: "approach",
    title: "Four-phase needs assessment and strategic planning approach",
    body: [
      "Our approach proceeds in four phases.",
      "",
      "1. Design and implement a needs assessment to gain insights into the current and desired state. We work with the project team to clarify the key research questions the assessment should answer, then design and conduct interviews, focus groups and surveys. Deliverables: a stakeholder map determining who to speak with, learning objectives for each stakeholder group, and the design and results of surveys, focus groups and 1:1 interviews.",
      "",
      "2. Generate an insights report summarising themes, key findings and an engagement plan. We use human and artificial intelligence to analyse and summarise the research, and create a visual engagement plan charting each stakeholder group's interest against its influence. Deliverables: a comprehensive Insights Report with both detailed and executive summaries, an engagement plan per stakeholder group, and the raw data table.",
      "",
      "3. Design and facilitate a comprehensive strategic planning process. This includes a change management and communication plan, the creation of a representative Strategic Planning Committee, and a set of benchmarks and targets to measure progress. Deliverables: facilitated sessions to align the roadmap - a north star, strategic imperatives, and 'we statements' specifying the behaviours needed to execute the strategy - plus a draft visual graphic of the roadmap and an outline of the full plan.",
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
    section_type: "firm_profile",
    title: "Consulting services and key capabilities",
    body: [
      "Define Strategy for Winning - what are the deliberate bets we are making that will help us win in the marketplace?",
      "",
      "Design culture that activates strategy - what are the behaviours we need in order to meet our strategy?",
      "",
      "Embed DEI into company DNA - how can we ensure everything we do is through a lens of diversity, equity, inclusion, belonging and justice?",
      "",
      "Enlightened leadership - emotional intelligence, executive coaching, and prosocial behaviours.",
      "",
      "Each engagement moves through the same client journey: Assessment, Articulation, Activation, Review.",
    ].join("\n"),
    is_boilerplate: true,
  },
  {
    section_type: "relevant_experience",
    title: "Higher education and global health - UCSF IGHS",
    body: [
      "Caravann designed and facilitated a needs assessment and four-to-five-year strategic plan for the UCSF Institute for Global Health Sciences, an institute of seven centres facing fragmentation across the wider university and a rapidly changing global health funding landscape.",
      "",
      "The engagement ran from September 2024 to May 2025 across four phases: needs assessment, insights report and engagement plan, facilitated strategic planning with a representative Strategic Planning Committee, and composition of the written plan to completion - concluding with team structure recommendations to support the institute's future direction.",
    ].join("\n"),
    is_boilerplate: false,
    won: true,
  },
  {
    section_type: "work_plan",
    title: "Detailed tasks across the four phases",
    body: [
      "Phase 1 - Needs assessment. Review existing materials. Initial conversation with the project team to map stakeholders and key personnel. Create a stakeholder map with learning objectives for each group. Develop and implement a change management and communication plan describing the overall process of engagement. Design and implement interviews, focus groups and surveys with a representative sample of stakeholders. Biweekly meetings with the project team to keep the project on track.",
      "",
      "Phase 2 - Insights report. Development of an insights report highlighting strengths and areas for improvement as they relate to strategic direction, the necessary elements of the desired future state, and the behaviours that will help execute the strategy. Create an engagement plan for each stakeholder group.",
      "",
      "Phase 3 - Strategic planning process. Creation of a representative Strategic Planning Committee. Gathering input from internal and external sources. Facilitated sessions to align the roadmap - north star, strategic imperatives and 'we statements'. Facilitated sessions to agree an outline for the written plan. A draft visual graphic of the roadmap.",
      "",
      "Phase 4 - Composition. Design a process to assign and compile written sections. Facilitate the compiling of input. Edit and finalise the written plan. Finalise the roadmap with the committee and gather feedback. Digitize the completed roadmap. Create team structure recommendations.",
    ].join("\n"),
    is_boilerplate: false,
  },
  {
    section_type: "team",
    title: "The full team",
    body: [
      "Caravann fields a team of thirteen consultants spanning strategy, organisational development, facilitation, coaching, research and design.",
      "",
      "Khaled El-Sawaf - Principal and lead facilitator. Kia Afcari - strategy, culture and DEI. Terrell Holmes - organisational development. Emiliana Simon-Thomas - happiness and wellbeing research. Crystal Fullwood - wellness. Deb Samuel - organisational psychology and burnout. Sarah Lightfoot - organisational development and facilitation. DB Bedford - emotional intelligence and executive coaching. Brenda Goodwin - coaching. Trent Wakenight - graphic recording and visual facilitation. Priscilla Kwok - design. Isabel Gabaldon - cross-functional delivery. Trudie Mitschang - change and communications.",
      "",
      "Graphic recording and visioning allow us to distill and illustrate the main ideas shared by speakers, facilitators and participants - driving strategic thinking, collaboration, clarity and alignment; visualising and implementing change; mapping thinking and processes; and building trust by reflecting back each individual's contributions.",
    ].join("\n"),
    is_boilerplate: false,
  },
];

/**
 * Caravann's own capability taxonomy, stated as three columns on the
 * "Consulting services and key capabilities" slide.
 *
 * This is what a solicitation's scope should actually be judged against. The
 * sector map answers "have you worked in this world before?"; this answers
 * "do you do this kind of work at all?" - and a solicitation asking for
 * executive coaching or graphic recording is a much better fit than a sector
 * count alone suggests.
 */
export const CAPABILITIES = {
  functional_areas: [
    "Change management",
    "Assessment and insights",
    "Communication strategy",
    "Culture transformation",
    "Strategic planning",
    "OKRs and priority setting",
    "Employee engagement",
    "Mental health and well-being",
  ],
  key_capabilities: [
    "Executive coaching",
    "Group facilitation",
    "Training and development",
    "Keynote presentations",
    "Leadership retreats",
    "Graphic recording",
    "Mission, vision and values",
    "Culture summits and rituals",
  ],
  subject_areas: [
    "Return to work",
    "Human-centered design",
    "Organizational psychology",
    "Burnout",
    "Emotional intelligence",
    "Prosocial workplaces",
  ],
};

/**
 * Organisations named on the deck's logo wall.
 *
 * READ THE CAVEAT BEFORE USING THIS ANYWHERE NEAR A BID. The slide is titled
 * "Some of the organizations **our consultants** have worked with" - that is
 * consultants' prior individual experience, not Caravann firm engagements. The
 * distinction is not pedantic: citing a consultant's former employer as a firm
 * engagement in a proposal is a misrepresentation, and misrepresentation in a
 * public procurement is the kind of thing that gets a bid thrown out and a firm
 * remembered for it.
 *
 * So this is recorded as evidence of the team's reach, and deliberately NOT fed
 * into the sector map as engagement counts.
 */
export const CONSULTANT_PRIOR_ORGANISATIONS = {
  caveat:
    "Prior work by individual consultants, not Caravann firm engagements. Never cite as firm experience without confirming which were delivered under Caravann.",
  higher_education: ["UC Berkeley", "UCSF", "UC Santa Cruz", "University of Auckland", "Baruch College (CUNY)"],
  healthcare: ["Kaiser Permanente", "Alameda Health System"],
  research: ["Berkeley Lab"],
  technology: ["Apple", "Intuit", "Juniper Networks", "VMware", "Lookout", "NU"],
  financial_services: ["Visa", "Valley Strong Credit Union"],
  philanthropy: ["Energy Foundation"],
};

/**
 * The single most useful thing to come out of reading this deck.
 *
 * The placeholder sector map rates "Public agencies (general)" as Caravann's
 * deepest sector at 34 engagements over 12 years, with higher education fourth
 * at 9. The deck points the other way: five named universities, two health
 * systems, a national lab and a wall of corporates - and **not one named city,
 * county, transit district or other municipal body**.
 *
 * That does not prove the public-agency figure is wrong. This deck was written
 * to win a university engagement, so it leads with university work, and the
 * UCSF engagement itself is a public institution. But it does mean the number
 * we are scoring every public-sector solicitation against has no support in the
 * one real document we have, while the sector it rates fourth has the most.
 *
 * Worth putting to Khaled as a specific question rather than as "please confirm
 * your sector map": how many engagements has *Caravann as a firm* delivered for
 * city, county, transit or other municipal clients?
 */
export const SECTOR_MAP_CONTRADICTION = {
  claimed_strongest: { sector: "Public agencies (general)", years: 12, engagements: 34, evidence: "none in the UCSF deck" },
  best_evidenced: { sector: "Higher education", claimed: { years: 6, engagements: 9 }, evidence: "5 named institutions" },
  question_for_khaled:
    "How many engagements has Caravann as a firm - not its consultants individually - delivered for city, county, transit or other municipal clients?",
};

/**
 * Rates, from Caravann's own SamTrans cost sheet.
 *
 * Three things in it are worth stating rather than quietly applying.
 *
 * First, rates are per ROLE, not per person. Khaled bills $250 doing project
 * management, $275 as principal consultant and $300 co-facilitating, on the
 * same engagement. A single rate per person cannot express that, and the
 * summary rate is an average of whatever mix that bid happened to need.
 *
 * Second, the summary puts Khaled at $275/hr. The profile currently says $285.
 * Both are plausible - one is a blended rate for a specific bid, the other may
 * be his standard - so neither is overwritten here. It is a question for him.
 *
 * Third, Rahul appears with 194 hours at $325, the second-largest share of the
 * engagement, and is not on the UCSF deck's team slide at all. Either the deck
 * predates him or he is a subcontractor. Also a question.
 */
export const SOURCED_RATES = {
  /** Summary rates, as billed on the SamTrans bid. */
  summary: [
    { name: "Khaled El-Sawaf", title: "Principal Consultant / Project Manager / Co-Facilitator", hours: 326, rate: 275 },
    { name: "Rahul", title: "Lead Facilitator / Facilitation Designer", hours: 194, rate: 325 },
    { name: "Trent Wakenight", title: "Graphic Recorder", hours: 30, rate: 125 },
  ],
  /** The rate actually charged for each kind of work, which is what a cost
   *  proposal is built from. */
  byRole: [
    { role: "Project Manager", rate: 250 },
    { role: "Principal Consultant", rate: 275 },
    { role: "Process Improvement Consultant", rate: 275 },
    { role: "Co-Facilitator", rate: 300 },
    { role: "Facilitation Designer", rate: 300 },
    { role: "Senior Review / Facilitation Advisor", rate: 300 },
    { role: "Lead Facilitator", rate: 350 },
    { role: "Graphic Recording", rate: 125 },
  ],
  totalHours: 508,
  openQuestions: [
    "Khaled's rate: the cost sheet says $275, the profile says $285. Which is standard?",
    "Rahul is 38% of the hours on this bid and is not on the team slide. Employee or subcontractor, and what is his surname?",
    "Are these rates current, or specific to the SamTrans bid?",
  ],
};

/**
 * A real engagement's phase-level pricing, useful as the reference point for
 * "does the stated budget cover the effort this scope implies?" - the rubric
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
