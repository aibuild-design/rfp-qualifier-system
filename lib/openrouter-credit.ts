/**
 * What is left on the OpenRouter account.
 *
 * Worth surfacing because running dry does not announce itself: triage simply
 * starts failing, and the desk keeps accepting solicitations that never get a
 * verdict. The failure looks like a quiet week, which is the same shape as
 * every other silent failure this system has had.
 *
 * Where to add credit, kept here beside the thresholds so the warning and the
 * fix never drift apart.
 *
 * Returns null rather than throwing. A billing lookup being unavailable must
 * never be the reason Settings will not render.
 */
export type Credit = {
  used: number;
  total: number;
  remaining: number;
  /** Roughly how many more solicitations that buys, at the measured rate. */
  solicitationsLeft: number;
  level: "ok" | "low" | "critical" | "empty";
};

/** Measured across real runs: about 18 cents a solicitation, three reads. */
export const COST_PER_SOLICITATION = 0.18;

/** Where money actually goes in. */
export const TOP_UP_URL = "https://openrouter.ai/settings/credits";

export async function openRouterCredit(apiKey: string | undefined): Promise<Credit | null> {
  if (!apiKey) return null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${apiKey}` },
      // Billing does not change minute to minute, and Settings should not wait
      // on a third party to paint.
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const total = Number(body?.data?.total_credits ?? 0);
    const used = Number(body?.data?.total_usage ?? 0);
    if (!Number.isFinite(total) || !Number.isFinite(used)) return null;

    const remaining = Math.max(0, total - used);
    const solicitationsLeft = Math.floor(remaining / COST_PER_SOLICITATION);
    return {
      used,
      total,
      remaining,
      solicitationsLeft,
      // Thresholds in solicitations rather than dollars, because "eleven more
      // bids" is a number someone can act on and "$2.03" is not. Under two is
      // its own level: one long solicitation can cost more than the average, so
      // at that point the next one through the door may not get a verdict.
      level:
        solicitationsLeft < 2
          ? "empty"
          : solicitationsLeft <= 10
            ? "critical"
            : solicitationsLeft <= 40
              ? "low"
              : "ok",
    };
  } catch {
    return null;
  }
}
