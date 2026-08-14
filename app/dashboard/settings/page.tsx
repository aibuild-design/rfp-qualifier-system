import { createClient } from "@/lib/supabase/server";
import { OrgProfileForm } from "@/components/settings/OrgProfileForm";
import { SectorExperienceEditor } from "@/components/settings/SectorExperienceEditor";
import { TeamRosterEditor } from "@/components/settings/TeamRosterEditor";
import { ScoringSettingsForm } from "@/components/settings/ScoringSettingsForm";
import { ProfileConfirmation } from "@/components/settings/ProfileConfirmation";
import { ConnectionsPanel } from "@/components/settings/ConnectionsPanel";

// Everything on this page is Khaled's own occasional editing - the
// eligibility profile and sector map "confirmed once" (module 3) and the
// team roster (module 9). Unlike the RFP queue, nothing here is written by
// n8n, so these editors write straight to Supabase from the browser.
export default async function SettingsPage() {
  const supabase = await createClient();

  const [
    {
      data: { user },
    },
    { data: orgProfile },
    { data: sectors },
    { data: team },
    { data: scoring },
    { data: scored },
    { data: lastEmail },
    { data: lastFiled },
    { data: lastVerdict },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("org_profile").select("*").eq("id", true).maybeSingle(),
    supabase.from("sector_experience").select("*").order("sector"),
    supabase.from("team_members").select("*").order("name"),
    supabase.from("scoring_settings").select("*").eq("id", true).maybeSingle(),
    // Real scores from the live queue, so the threshold preview shows the
    // effect on actual work rather than on a hypothetical.
    supabase.from("rfps").select("score_percent").not("score_percent", "is", null),
    // Evidence for the connections panel: the last time each outside connection
    // demonstrably did something. Ordered nullsFirst:false so a row that never
    // reached that stage cannot masquerade as the most recent one.
    supabase.from("rfps").select("created_at,source_mailbox").eq("source", "email").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("rfps").select("filed_at,drive_folder_url").eq("filing_status", "filed").order("filed_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    supabase.from("rfps").select("verdict_set_at").not("verdict_set_at", "is", null).order("verdict_set_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const scoreSample = (scored ?? [])
    .map((r) => r.score_percent)
    .filter((s): s is number => typeof s === "number");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-rfp-ink">Settings</h1>
        <p className="mt-1 text-sm text-rfp-ink-secondary">
          What Caravann is, and how cautious the desk should be. The first is filled in once; the
          second is worth revisiting.
        </p>
      </div>

      <div className="rounded-xl border border-rfp-border bg-rfp-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">Account</p>
        <p className="mt-1.5 text-sm text-rfp-ink">{user?.email}</p>
      </div>

      {/* Two kinds of setting, and conflating them is why this screen was
          confusing. The first part is facts about Caravann - there is a right
          answer, the desk cannot work without it, and it is filled in once.
          The second is judgement - no right answer, only Khaled's preference,
          and worth revisiting as he learns what the desk gets wrong.

          Facts come first because tuning thresholds against placeholder data is
          wasted effort. */}
      <section className="mt-10">
        <div className="border-b border-rfp-border pb-3">
          <h2 className="font-display text-lg font-semibold text-rfp-ink">1 · About Caravann</h2>
          <p className="mt-1 text-sm leading-relaxed text-rfp-ink-secondary">
            The facts every verdict is computed from. These have right answers, and until they are
            filled in and confirmed the desk marks its own verdicts provisional.
          </p>
        </div>

        <div className="mt-6">
          <h3 className="font-display text-sm font-semibold text-rfp-ink">Eligibility profile</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">
            Capabilities, locations, insurance and certifications the disqualifier gate checks a
            solicitation against.
          </p>
          <div className="mt-3">
            {orgProfile ? (
              <OrgProfileForm initial={orgProfile} />
            ) : (
              <p className="rounded-xl border border-dashed border-rfp-border-strong bg-rfp-surface p-5 text-sm text-rfp-ink-muted">
                Org profile row missing - run the migration to seed it.
              </p>
            )}
          </div>
        </div>

        <div className="mt-8">
          <h3 className="font-display text-sm font-semibold text-rfp-ink">Sector experience map</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">
            Years and engagement counts per sector. This is what &ldquo;how deep is Caravann&rsquo;s
            experience here?&rdquo; is judged against - a sector left at zero will rule out work.
          </p>
          <div className="mt-3">
            <SectorExperienceEditor initial={sectors ?? []} />
          </div>
        </div>

        <div className="mt-8">
          <h3 className="font-display text-sm font-semibold text-rfp-ink">Team roster</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">
            Who team match recommends from. Every assignment is yours to confirm.
          </p>
          <div className="mt-3">
            <TeamRosterEditor initial={team ?? []} />
          </div>
        </div>

        <div className="mt-8">
          {orgProfile && (
            <ProfileConfirmation
              initial={orgProfile}
              sectorsMissingCounts={(sectors ?? [])
                .filter((x) => x.years_experience === null || x.engagement_count === null)
                .map((x) => x.sector)}
              teamCount={(team ?? []).length}
            />
          )}
        </div>
      </section>

      <section className="mt-12 mb-4">
        <div className="border-b border-rfp-border pb-3">
          <h2 className="font-display text-lg font-semibold text-rfp-ink">2 · How the desk decides</h2>
          <p className="mt-1 text-sm leading-relaxed text-rfp-ink-secondary">
            Judgement, not fact. There is no correct answer here - only how cautious you want to be,
            and it is worth changing as you see what the desk gets wrong. Adjustable any time; the
            next solicitation uses the new numbers without a deploy.
          </p>
        </div>

        <div className="mt-6">
          <h3 className="font-display text-sm font-semibold text-rfp-ink">Scoring and thresholds</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">
            Where the go/no-go line sits, how far the reads may disagree before the desk stops
            claiming confidence, and what each scoring dimension is worth. The model reports what it
            found; these numbers decide the label, which is why the same solicitation always gets the
            same verdict.
          </p>
          <div className="mt-3">
            {scoring ? (
              <ScoringSettingsForm initial={scoring} scoreSample={scoreSample} />
            ) : (
              <p className="rounded-xl border border-dashed border-rfp-border-strong bg-rfp-surface p-5 text-sm text-rfp-ink-muted">
                Scoring settings row missing - run <code>npm run migrate</code>.
              </p>
            )}
          </div>
        </div>
      </section>

      <ConnectionsPanel
        lastEmailAt={lastEmail?.created_at ?? null}
        lastMailbox={lastEmail?.source_mailbox ?? null}
        lastFiledAt={lastFiled?.filed_at ?? null}
        lastFolderUrl={lastFiled?.drive_folder_url ?? null}
        lastVerdictAt={lastVerdict?.verdict_set_at ?? null}
        triageConfigured={Boolean(process.env.N8N_BASE_URL && process.env.RFP_INTAKE_API_KEY)}
        profileConfirmed={orgProfile?.profile_confirmed === true}
        n8nUrl={process.env.N8N_BASE_URL?.replace(/\/+$/, "") ?? null}
      />
    </div>
  );
}
