import Link from "next/link";

/**
 * Two different ways the profile can fail a verdict, said differently because
 * they need different actions.
 *
 * `no-sectors` — nothing recorded at all, so the gate has nothing to judge
 * against and will rule out work Caravann is strong in. A false no-go on a
 * winnable contract is the most expensive way this system can be wrong.
 *
 * `unconfirmed` — the profile is populated but nobody has checked it against
 * reality. It ships pre-filled with plausible figures on purpose (confirming
 * numbers is faster than facing a blank form), and the cost of that choice is
 * that the desk will produce confident-looking verdicts from data nobody has
 * verified. This is the state the system is actually in most of the time, and
 * the old banner never fired for it — it only checked whether sector rows
 * existed, and seven placeholder rows look identical to seven real ones.
 */
export function ProfileIncompleteBanner({ reason }: { reason: "no-sectors" | "unconfirmed" }) {
  const settingsLink = (
    <Link href="/dashboard/settings" className="font-medium text-rfp-ink underline underline-offset-2">
      eligibility profile
    </Link>
  );

  return (
    <div className="mb-6 rounded-xl border border-rfp-warning/30 bg-rfp-warning/5 p-4">
      <p className="text-sm font-semibold text-rfp-ink">
        {reason === "no-sectors"
          ? "Verdicts aren’t trustworthy yet"
          : "Verdicts are provisional until the profile is confirmed"}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-rfp-ink-secondary">
        {reason === "no-sectors" ? (
          <>
            No sector experience is recorded, so the disqualifier gate has nothing to check a
            solicitation against — it will rule out work Caravann is strong in. Fill in the{" "}
            {settingsLink} and sector map before relying on any go/no-go call.
          </>
        ) : (
          <>
            Every figure in the {settingsLink} is a placeholder nobody has checked — locations,
            capabilities, certifications, insurance and the sector map. Verdicts computed against
            it are stored and marked <span className="font-medium text-rfp-ink">provisional</span>,
            and confirming the profile later does not make them correct; they need re-triaging.
            Go through it once and tick <span className="font-medium text-rfp-ink">Profile
            confirmed</span> at the bottom.
          </>
        )}
      </p>
    </div>
  );
}

/** Row- and card-level marker, so a verdict is never read without its caveat
 *  even after the banner above stops showing. */
export function ProvisionalTag() {
  return (
    <span
      title="Scored against an unconfirmed eligibility profile — re-triage before acting on it."
      className="ml-2 inline-flex shrink-0 items-center rounded bg-rfp-warning/15 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-rfp-warning"
    >
      Provisional
    </span>
  );
}
