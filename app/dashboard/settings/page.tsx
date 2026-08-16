import { createClient } from "@/lib/supabase/server";
import { OrgProfileForm } from "@/components/settings/OrgProfileForm";
import { SectorExperienceEditor } from "@/components/settings/SectorExperienceEditor";
import { TeamRosterEditor } from "@/components/settings/TeamRosterEditor";
import { ScoringSettingsForm } from "@/components/settings/ScoringSettingsForm";
import { ProfileConfirmation } from "@/components/settings/ProfileConfirmation";
import { ConnectionsPanel } from "@/components/settings/ConnectionsPanel";
import { SubjectTermsEditor } from "@/components/settings/SubjectTermsEditor";
import { openRouterCredit } from "@/lib/openrouter-credit";

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
    { data: health },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("org_profile").select("*").eq("id", true).maybeSingle(),
    supabase.from("sector_experience").select("*").order("sector"),
    supabase.from("team_members").select("*").order("name"),
    supabase.from("scoring_settings").select("*").eq("id", true).maybeSingle(),
    // Real scores from the live queue, so the threshold preview shows the
    // effect on actual work rather than on a hypothetical.
    supabase.from("rfps").select("score_percent").not("score_percent", "is", null),
    // Evidence for the connections panel. Read from connection_events rather
    // than from the queue: clearing solicitations is not evidence that Google
    // stopped working, and deriving it from rfps meant an empty queue reported
    // three healthy connections as unproven.
    supabase.from("connection_events").select("kind,last_ok_at,detail"),
  ]);

  const credit = await openRouterCredit(process.env.OPENROUTER_API_KEY);

  const byKind = new Map((health ?? []).map((h) => [h.kind, h]));
  const gmail = byKind.get("gmail");
  const triage = byKind.get("triage");
  const drive = byKind.get("drive");

  const scoreSample = (scored ?? [])
    .map((r) => r.score_percent)
    .filter((s): s is number => typeof s === "number");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-rfp-ink">Settings</h1>
        <p className="mt-1 text-sm text-rfp-ink-secondary">
          What Caravann is, and how cautious the desk should be.
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
            The facts every verdict is computed from. Until they are confirmed, verdicts are
            marked provisional.
          </p>
        </div>

        <div className="mt-6">
          <h3 className="font-display text-sm font-semibold text-rfp-ink">Eligibility profile</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">
            What the gate checks a solicitation against.
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
            Years and engagements per sector. A sector left at zero will rule out work.
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
            Judgement, not fact. Change it as you see what the desk gets wrong. The next
            solicitation uses the new numbers.
          </p>
        </div>

        <div className="mt-6">
          <h3 className="font-display text-sm font-semibold text-rfp-ink">Scoring and thresholds</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">
            Where the go/no-go line sits, and what each dimension is worth. These numbers decide
            the label, which is why the same solicitation always gets the same verdict.
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

      <section className="mt-8">
        <h2 className="font-display text-sm font-semibold text-rfp-ink">Which emails get triaged</h2>
        <p className="mt-0.5 text-xs text-rfp-ink-muted">
          An email whose subject contains none of these is never read.
        </p>
        <div className="mt-3">
          <SubjectTermsEditor initial={scoring?.email_subject_terms ?? []} />
        </div>
      </section>

      <ConnectionsPanel
        lastEmailAt={gmail?.last_ok_at ?? null}
        lastMailbox={gmail?.detail ?? null}
        lastFiledAt={drive?.last_ok_at ?? null}
        lastFolderUrl={drive?.detail ?? null}
        lastVerdictAt={triage?.last_ok_at ?? null}
        triageConfigured={Boolean(process.env.N8N_BASE_URL && process.env.RFP_INTAKE_API_KEY)}
        profileConfirmed={orgProfile?.profile_confirmed === true}
        n8nUrl={process.env.N8N_BASE_URL?.replace(/\/+$/, "") ?? null}
        credit={credit}
      />
    </div>
  );
}
