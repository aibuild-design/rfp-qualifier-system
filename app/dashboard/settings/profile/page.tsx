import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { OrgProfileForm } from "@/components/settings/OrgProfileForm";
import { ProfileConfirmation } from "@/components/settings/ProfileConfirmation";

export default async function Page() {
  const supabase = await createClient();
  const [{ data: orgProfile }, { data: sectors }, { count: teamCount }] = await Promise.all([
    supabase.from("org_profile").select("*").eq("id", true).maybeSingle(),
    supabase.from("sector_experience").select("*").order("sector"),
    supabase.from("team_members").select("*", { count: "exact", head: true }),
  ]);

  return (
    <SettingsShell title="Eligibility profile" intro="The facts every verdict is computed from. The gate checks each stated requirement against these, so a blank field comes back unclear rather than as a pass.">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
        Used for analysis. The gate reads every field here.
      </p>
      {orgProfile && <OrgProfileForm initial={orgProfile} />}
      <div className="mt-6">
        {orgProfile && (
          <ProfileConfirmation
            initial={orgProfile}
            sectorsMissingCounts={(sectors ?? [])
              .filter((x) => x.years_experience === null || x.engagement_count === null)
              .map((x) => x.sector)}
            teamCount={teamCount ?? 0}
          />
        )}
      </div>
    </SettingsShell>
  );
}
