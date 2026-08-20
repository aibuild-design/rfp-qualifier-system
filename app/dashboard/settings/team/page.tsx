import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TeamDepthEditor } from "@/components/settings/TeamDepthEditor";

/**
 * The roster, in the depth a proposal needs.
 *
 * Settings had every section on one page, and the team was four columns in a
 * table: name, role, rate, bandwidth. Enough to rank somebody against a
 * solicitation and nowhere near enough to write them into a submission.
 * Caravann's own proposals carry a staffing table of name, role and primary
 * responsibilities, then biographies underneath.
 *
 * Its own page because that depth does not belong in a row. A biography and a
 * list of responsibilities need room, and cramming them into the settings table
 * would make the page longer for everyone whether or not they came to edit the
 * team.
 */
export default async function TeamSettingsPage() {
  const supabase = await createClient();
  const { data: team } = await supabase.from("team_members").select("*").order("name");

  const withDepth = (team ?? []).filter((m) => m.responsibilities || m.bio).length;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/settings" className="press text-sm font-medium text-rfp-ink-muted hover:text-rfp-gold">
        &larr; Settings
      </Link>

      <div className="mt-4">
        <h1 className="font-display text-2xl font-semibold text-rfp-ink">Team roster</h1>
        <p className="mt-1 text-sm text-rfp-ink-secondary">
          {team?.length ?? 0} people. {withDepth} have the detail a proposal needs.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-rfp-ink-muted">
          Name, role and rate are enough to suggest who should staff a bid. Responsibilities and a
          biography are what let the desk write them into the submission, the way your own
          proposals list them.
        </p>
      </div>

      <TeamDepthEditor initial={team ?? []} />
    </div>
  );
}
