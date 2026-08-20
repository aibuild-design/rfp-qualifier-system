import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { StandingDocsManager } from "@/components/settings/StandingDocsManager";

export default async function Page() {
  const supabase = await createClient();
  const { data: standingDocs } = await supabase
    .from("standing_documents")
    .select("id, label, file_name, storage_path, expires_on")
    .order("label");

  return (
    <SettingsShell title="Attach to every submission" intro="Paperwork that goes with every bid regardless of what it asks for. These upload into the bid folder alongside the draft, so they are where you need them when you submit.">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
        Used for the proposal. Attached as files, never edited.
      </p>
      <StandingDocsManager initial={standingDocs ?? []} />
    </SettingsShell>
  );
}
