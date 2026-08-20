import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { PastEngagements } from "@/components/settings/PastEngagements";
import { LearnFromProposal } from "@/components/settings/LearnFromProposal";

export default async function Page() {
  const supabase = await createClient();
  const { data: engagements } = await supabase
    .from("past_engagements")
    .select("*")
    .order("won", { ascending: false });

  return (
    <SettingsShell title="Work you can cite" intro="Engagements Caravann can put in front of an agency. The desk picks the ones closest to each solicitation and writes them into past performance, which is where most public-agency bids are scored.">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
        Used for the proposal. Past performance is written from these.
      </p>
      <PastEngagements initial={engagements ?? []} />

      {/* Typing an engagement in is fine for one. A folder of case studies is
          why the table was empty. */}
      <div className="mt-8">
        <h2 className="font-display text-sm font-semibold text-rfp-ink">
          Read them out of a case study
        </h2>
        <div className="mt-3">
          <LearnFromProposal kind="case_study" />
        </div>
      </div>
    </SettingsShell>
  );
}
