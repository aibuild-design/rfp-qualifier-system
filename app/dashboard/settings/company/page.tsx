import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { CompanyDetails } from "@/components/settings/CompanyDetails";

export default async function Page() {
  const supabase = await createClient();
  const { data: orgProfile } = await supabase
    .from("org_profile")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  return (
    <SettingsShell
      title="Company details"
      intro="What appears on the front of every submission. These were constants in the code until now, which meant a change of office needed a deploy and nobody could check what was being sent out under Caravann's name."
    >
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
        Used for the proposal. The cover page of every draft.
      </p>
      {orgProfile && <CompanyDetails initial={orgProfile} />}
    </SettingsShell>
  );
}
