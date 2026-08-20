import type { Credit } from "@/lib/openrouter-credit";

/**
 * The thing that stops the whole desk, said where it is actually read.
 *
 * The credit gauge lives in Settings, inside the connections panel, which is a
 * page nobody opens on a normal day. So the balance ran to zero unannounced,
 * and the failure it caused was silent in the worst way: triage stops
 * returning verdicts and every written section of every proposal falls back to
 * a stitch of library blocks. The draft still appears. It is simply worse, for
 * a reason nothing on screen mentions.
 *
 * On the queue instead, because that is the page that is open when a
 * solicitation arrives and the page where an unexplained verdict would first
 * be noticed.
 */
export function CreditBanner({ credit }: { credit: Credit | null }) {
  if (!credit || credit.level === "ok") return null;

  const empty = credit.level === "empty";
  const tone = empty ? "var(--rfp-critical)" : "var(--rfp-warning)";

  return (
    <div
      className="mb-6 rounded-xl p-4"
      style={{ border: `1px solid color-mix(in srgb, ${tone} 30%, transparent)`, background: `color-mix(in srgb, ${tone} 6%, transparent)` }}
    >
      <p className="text-sm font-semibold text-rfp-ink">
        {empty
          ? "OpenRouter has no credit left, so nothing is being read or drafted"
          : "OpenRouter credit is nearly gone"}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-rfp-ink-secondary">
        {empty ? (
          <>
            The balance is{" "}
            <span className="tabular font-medium text-rfp-ink">${credit.remaining.toFixed(2)}</span>.
            Solicitations arriving now get no verdict, and any proposal built meanwhile falls back
            to stitched library text rather than being written for the bid. Nothing is lost: both
            recover on a rebuild once the account is topped up.
          </>
        ) : (
          <>
            <span className="tabular font-medium text-rfp-ink">
              ${credit.remaining.toFixed(2)}
            </span>{" "}
            left, roughly{" "}
            <span className="tabular font-medium text-rfp-ink">{credit.solicitationsLeft}</span> more
            solicitation{credit.solicitationsLeft === 1 ? "" : "s"} at the current rate.
          </>
        )}{" "}
        <a
          href="https://openrouter.ai/settings/credits"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-rfp-ink underline underline-offset-2"
        >
          Top up
        </a>
        .
      </p>
    </div>
  );
}
