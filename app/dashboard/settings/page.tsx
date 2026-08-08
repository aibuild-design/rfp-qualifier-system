import { createClient } from "@/lib/supabase/server";
import { OrgProfileForm } from "@/components/settings/OrgProfileForm";
import { SectorExperienceEditor } from "@/components/settings/SectorExperienceEditor";
import { TeamRosterEditor } from "@/components/settings/TeamRosterEditor";
import { ScoringSettingsForm } from "@/components/settings/ScoringSettingsForm";

// Everything on this page is Khaled's own occasional editing — the
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
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("org_profile").select("*").eq("id", true).maybeSingle(),
    supabase.from("sector_experience").select("*").order("sector"),
    supabase.from("team_members").select("*").order("name"),
    supabase.from("scoring_settings").select("*").eq("id", true).maybeSingle(),
    // Real scores from the live queue, so the threshold preview shows the
    // effect on actual work rather than on a hypothetical.
    supabase.from("rfps").select("score_percent").not("score_percent", "is", null),
  ]);

  const scoreSample = (scored ?? [])
    .map((r) => r.score_percent)
    .filter((s): s is number => typeof s === "number");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-rfp-ink">Settings</h1>
        <p className="mt-1 text-sm text-rfp-ink-secondary">
          Confirmed once, read by every RFP&rsquo;s disqualifier gate and scoring.
        </p>
      </div>

      <div className="rounded-xl border border-rfp-border bg-rfp-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">Account</p>
        <p className="mt-1.5 text-sm text-rfp-ink">{user?.email}</p>
      </div>

      <div className="mt-8">
        <h2 className="font-display text-sm font-semibold text-rfp-ink">Scoring and thresholds</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">
          Where the go/no-go line sits. The model reports a score and which requirements pass; these
          numbers decide the label, so the same solicitation always gets the same verdict.
        </p>
        <div className="mt-3">
          {scoring ? (
            <ScoringSettingsForm initial={scoring} scoreSample={scoreSample} />
          ) : (
            <p className="rounded-xl border border-dashed border-rfp-border-strong bg-rfp-surface p-5 text-sm text-rfp-ink-muted">
              Scoring settings row missing — run <code>npm run migrate</code>.
            </p>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="font-display text-sm font-semibold text-rfp-ink">Eligibility profile</h2>
        <p className="mt-0.5 text-xs text-rfp-ink-muted">
          Org-wide capabilities and locations the disqualifier gate checks against.
        </p>
        <div className="mt-3">
          {orgProfile ? (
            <OrgProfileForm initial={orgProfile} />
          ) : (
            <p className="rounded-xl border border-dashed border-rfp-border-strong bg-rfp-surface p-5 text-sm text-rfp-ink-muted">
              Org profile row missing — run the migration to seed it.
            </p>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="font-display text-sm font-semibold text-rfp-ink">Sector experience map</h2>
        <p className="mt-0.5 text-xs text-rfp-ink-muted">Years and engagement counts per sector.</p>
        <div className="mt-3">
          <SectorExperienceEditor initial={sectors ?? []} />
        </div>
      </div>

      <div className="mt-8 mb-4">
        <h2 className="font-display text-sm font-semibold text-rfp-ink">Team roster</h2>
        <p className="mt-0.5 text-xs text-rfp-ink-muted">
          What team match (module 9) recommends against — you confirm every assignment.
        </p>
        <div className="mt-3">
          <TeamRosterEditor initial={team ?? []} />
        </div>
      </div>
    </div>
  );
}
