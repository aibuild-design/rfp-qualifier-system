import { createClient } from "@/lib/supabase/server";
import { SettingsIndex, type SettingsCard } from "@/components/settings/SettingsIndex";
import { ConnectionsPanel } from "@/components/settings/ConnectionsPanel";
import { openRouterCredit } from "@/lib/openrouter-credit";

/**
 * Settings as a hub.
 *
 * Everything used to sit on one page: the eligibility profile, the sector map,
 * the roster, thresholds, intake terms, standing documents, engagements and the
 * Slack webhook, stacked. That made adding depth anywhere a cost to everybody,
 * and the team's biographies competed for scroll with a webhook URL.
 *
 * Each card carries two things a menu usually leaves out. What it is used for,
 * because "is this for the analysis or the proposal" turned out to be the
 * question nobody could answer from looking. And what is actually filled in, so
 * the page reads as a list of what to do next rather than a list of names.
 */
export default async function SettingsPage() {
  const supabase = await createClient();

  const [
    { data: orgProfile },
    { data: sectors },
    { data: team },
    { data: scoring },
    { data: engagements },
    { data: standingDocs },
    { count: blocks },
    { count: knockouts },
    { data: health },
  ] = await Promise.all([
    supabase.from("org_profile").select("*").eq("id", true).maybeSingle(),
    supabase.from("sector_experience").select("sector, years_experience, engagement_count"),
    supabase.from("team_members").select("id, responsibilities, bio"),
    supabase.from("scoring_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("past_engagements").select("id, reference_name"),
    supabase.from("standing_documents").select("id"),
    supabase.from("language_blocks").select("*", { count: "exact", head: true }),
    supabase.from("hard_knockouts").select("*", { count: "exact", head: true }),
    supabase.from("connection_events").select("kind,last_ok_at,detail"),
  ]);

  const sectorsFilled = (sectors ?? []).filter((s) => s.years_experience !== null).length;
  // Responsibilities are what a staffing table needs; a biography is an
  // addition. Counting only the complete ones reported 0 of 13 when every one
  // of them could already be named in a proposal.
  const teamReady = (team ?? []).filter((m) => m.responsibilities).length;
  const withReference = (engagements ?? []).filter((e) => e.reference_name).length;
  const companyMissing = [
    orgProfile?.legal_name, orgProfile?.address, orgProfile?.point_of_contact,
    orgProfile?.telephone, orgProfile?.email, orgProfile?.website,
    orgProfile?.cage_code, orgProfile?.uei, orgProfile?.duns, orgProfile?.tax_ein,
  ].filter((v) => !v).length;
  const insuranceMissing = !orgProfile?.insurance_coverage?.trim();
  const setAsideMissing = (orgProfile?.set_aside_status ?? []).length === 0;

  const groups: { label: string; cards: SettingsCard[] }[] = [
    {
      label: "What Caravann is",
      cards: [
        {
          href: "/dashboard/settings/profile",
          title: "Eligibility profile",
          blurb: "Used for analysis. The gate checks every requirement against these.",
          status: insuranceMissing || setAsideMissing
            ? `${[insuranceMissing && "insurance", setAsideMissing && "set-aside status"].filter(Boolean).join(" and ")} not recorded`
            : orgProfile?.profile_confirmed
              ? "Complete and confirmed"
              : "Complete, not yet confirmed",
          attention: insuranceMissing || setAsideMissing || !orgProfile?.profile_confirmed,
        },
        {
          href: "/dashboard/settings/company",
          title: "Company details",
          blurb: "Used for the proposal. The cover page of every draft.",
          status: companyMissing === 0 ? "Complete" : `${companyMissing} fields empty`,
          attention: companyMissing > 0,
        },
        {
          href: "/dashboard/settings/sectors",
          title: "Sector experience",
          blurb: "Used for analysis. Two of the five scoring dimensions.",
          status: `${sectorsFilled} of ${(sectors ?? []).length} sectors have numbers`,
          attention: sectorsFilled < (sectors ?? []).length,
        },
        {
          href: "/dashboard/settings/team",
          title: "Team roster",
          blurb: "Used for both. Suggests who staffs a bid, and names them in the proposal.",
          status: `${teamReady} of ${(team ?? []).length} can be named in a proposal`,
          attention: teamReady < (team ?? []).length,
        },
      ],
    },
    {
      label: "What the proposal is built from",
      cards: [
        {
          href: "/dashboard/library",
          title: "Approved language",
          blurb: "Used for the proposal. Every drafted section starts here.",
          status: `${blocks ?? 0} blocks on file`,
          attention: (blocks ?? 0) < 20,
        },
        {
          href: "/dashboard/settings/engagements",
          title: "Work you can cite",
          blurb: "Used for the proposal. Past performance is written from these.",
          status: (engagements ?? []).length === 0
            ? "Nothing on file"
            : `${(engagements ?? []).length} engagements, ${withReference} with a reference`,
          attention: (engagements ?? []).length === 0 || withReference === 0,
        },
        {
          href: "/dashboard/settings/documents",
          title: "Attach to every submission",
          blurb: "Used for the proposal. Uploaded into every bid folder.",
          status: (standingDocs ?? []).length === 0
            ? "Nothing uploaded"
            : `${(standingDocs ?? []).length} documents`,
          attention: (standingDocs ?? []).length === 0,
        },
      ],
    },
    {
      label: "How it behaves",
      cards: [
        {
          href: "/dashboard/settings/scoring",
          title: "How the desk decides",
          blurb: "Used for analysis. Turns a score into a verdict.",
          status: `Go at ${scoring?.go_threshold ?? 70}%, maybe at ${scoring?.maybe_threshold ?? 60}%, ${knockouts ?? 0} dealbreakers`,
          attention: (knockouts ?? 0) === 0,
        },
        {
          href: "/dashboard/settings/intake",
          title: "Which emails get triaged",
          blurb: "Used for intake. Nothing downstream runs without this.",
          status: `${(scoring?.email_subject_terms ?? []).length} terms, body matching ${scoring?.intake_match_body ? "on" : "off"}`,
          attention: (scoring?.email_subject_terms ?? []).length === 0,
        },
        {
          href: "/dashboard/settings/notifications",
          title: "Where verdicts are sent",
          blurb: "Used for notification. Does not affect any verdict.",
          status: scoring?.slack_webhook_url ? "Posting to Slack" : "Nothing set up",
          attention: !scoring?.slack_webhook_url,
        },
      ],
    },
  ];

  const last = (kind: string) => (health ?? []).find((h) => h.kind === kind);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-semibold text-rfp-ink">Settings</h1>
      <p className="mt-1 text-sm text-rfp-ink-secondary">
        What Caravann is, what the proposal is built from, and how the desk behaves.
      </p>

      <div className="mt-6">
        <SettingsIndex groups={groups} />
      </div>

      <ConnectionsPanel
        lastEmailAt={last("gmail")?.last_ok_at ?? null}
        lastMailbox={last("gmail")?.detail ?? null}
        lastFiledAt={last("drive")?.last_ok_at ?? null}
        lastFolderUrl={last("drive")?.detail ?? null}
        lastVerdictAt={last("triage")?.last_ok_at ?? null}
        triageConfigured={Boolean(process.env.N8N_BASE_URL && process.env.RFP_INTAKE_API_KEY)}
        profileConfirmed={Boolean(orgProfile?.profile_confirmed)}
        n8nUrl={process.env.N8N_BASE_URL ?? null}
        credit={await openRouterCredit()}
      />
    </div>
  );
}
