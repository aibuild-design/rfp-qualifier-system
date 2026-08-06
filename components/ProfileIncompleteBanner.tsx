import Link from "next/link";

// With no sector experience recorded, the disqualifier gate has nothing to
// judge against and rules out work Caravann is actually strong in — a false
// no_go on a winnable contract, which is the most expensive way this system
// can be wrong. Say so loudly rather than letting the verdicts look
// authoritative.
export function ProfileIncompleteBanner() {
  return (
    <div className="mb-6 rounded-xl border border-rfp-warning/30 bg-rfp-warning/5 p-4">
      <p className="text-sm font-semibold text-rfp-ink">Verdicts aren&rsquo;t trustworthy yet</p>
      <p className="mt-1 text-sm leading-relaxed text-rfp-ink-secondary">
        No sector experience is recorded, so the disqualifier gate has nothing to check a
        solicitation against — it will rule out work Caravann is strong in. Fill in the{" "}
        <Link href="/dashboard/settings" className="font-medium text-rfp-ink underline underline-offset-2">
          eligibility profile and sector map
        </Link>{" "}
        before relying on any go/no-go call.
      </p>
    </div>
  );
}
