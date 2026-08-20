import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { SectorExperienceEditor } from "@/components/settings/SectorExperienceEditor";

export default async function Page() {
  const supabase = await createClient();
  const { data: sectors } = await supabase.from("sector_experience").select("*").order("sector");

  return (
    <SettingsShell title="Sector experience" intro="Years and engagement counts per sector. Two of the five scoring dimensions read these directly, so a sector left blank scores as unknown rather than as zero.">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
        Used for analysis. Sector depth and comparable engagements.
      </p>
      <SectorExperienceEditor initial={sectors ?? []} />
    </SettingsShell>
  );
}
