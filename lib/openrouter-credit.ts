import { openRouterKeys } from "@/lib/openrouter";
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
  level: "ok" | "low" | "empty";
  /**
   * Per account, in the order they are tried.
   *
   * The totals above are the sum, because what the desk can actually do is
   * decided by every account together: one empty account does not stop
   * anything while another still has credit. The breakdown is here so the
   * gauge can say *which* one ran dry, which is the part a person acts on.
   */
  accounts: { id: string; label: string; remaining: number; reachable: boolean }[];
};

/** Measured across real runs: about 18 cents a solicitation at three reads,
 *  so roughly 12 at the two the workflow now runs. */
export const COST_PER_SOLICITATION = 0.18;

/**
 * What one proposal build costs, measured across real runs.
 *
 * Five composed sections at roughly 2,500 words each, plus a retry when one is
 * rejected. Observed between $0.28 and $0.52; the upper figure is used, because
 * the failure this guards against is starting a build that runs out halfway.
 */
export const COST_PER_PROPOSAL = 0.52;

/** Where money actually goes in. */
export const TOP_UP_URL = "https://openrouter.ai/settings/credits";

/**
 * The gauge fills at this much credit, and does not move when more is added.
 *
 * Remaining over the lifetime total is the obvious scale and the wrong one.
 * The total only ever grows, so the same $9 sits at 18% of a $50 account and
 * 4.5% of a $200 one, and the bar quietly changes what it means every time
 * anybody tops up. A fixed ceiling means a given height always describes the
 * same amount of runway.
 *
 * Held at five times the warning line. Much higher and the entire range worth
 * watching is squeezed into the left tenth of the bar, where the notch and the
 * fill sit on top of each other and neither can be read.
 */
export const GAUGE_CEILING = 10;

/**
 * Warn below this much credit. One line, not a ladder.
 *
 * This was three tiers starting at $7.20, which is roughly forty solicitations
 * of notice and reads as nagging: a warning that is usually on is a warning
 * nobody looks at. $2 is about eleven solicitations, which is a week or two of
 * arrivals rather than a month.
 *
 * The cost of drawing it here rather than higher: if a run of long documents
 * lands, eleven is optimistic, and there is less room to notice and act. That
 * is the trade being made deliberately.
 */
export const WARN_BELOW = 2;

/** One account's balance, or null when it cannot be reached. */
async function balanceOf(apiKey: string): Promise<{ total: number; used: number } | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${apiKey}` },
      // Billing does not change minute to minute, and a page should not wait
      // on a third party to paint.
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const total = Number(body?.data?.total_credits ?? 0);
    const used = Number(body?.data?.total_usage ?? 0);
    if (!Number.isFinite(total) || !Number.isFinite(used)) return null;
    return { total, used };
  } catch {
    return null;
  }
}

/**
 * What the desk has to spend, across every configured account.
 *
 * Takes no key. It used to take the one it should check, which stopped being
 * meaningful the moment there were two: reporting only the first would show an
 * empty gauge while the desk was working perfectly well on the second.
 */
export async function openRouterCredit(): Promise<Credit | null> {
  const keys = openRouterKeys();
  if (keys.length === 0) return null;

  const balances = await Promise.all(keys.map((k) => balanceOf(k.key)));
  const accounts = keys.map((k, i) => {
    const b = balances[i];
    return {
      id: k.id,
      label: k.label,
      remaining: b ? Math.max(0, b.total - b.used) : 0,
      reachable: b !== null,
    };
  });
  if (accounts.every((a) => !a.reachable)) return null;

  const total = balances.reduce((n, b) => n + (b?.total ?? 0), 0);
  const used = balances.reduce((n, b) => n + (b?.used ?? 0), 0);
  const remaining = accounts.reduce((n, a) => n + a.remaining, 0);

  return {
    used,
    total,
    remaining,
    solicitationsLeft: Math.floor(remaining / COST_PER_SOLICITATION),
    // Empty means it cannot pay for one more, not that the number reached
    // zero: at eleven cents the next solicitation still arrives with no
    // verdict, and that is the thing worth saying.
    level: remaining < COST_PER_SOLICITATION ? "empty" : remaining < WARN_BELOW ? "low" : "ok",
    accounts,
  };
}
