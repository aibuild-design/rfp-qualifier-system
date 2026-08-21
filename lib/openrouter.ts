/**
 * Two accounts, tried in order, so one running dry is not an outage.
 *
 * The desk stopped mid-session when a single key hit its limit: triage stopped
 * returning verdicts and every written section of every proposal quietly fell
 * back to stitched library text. There was a second account available the whole
 * time and no way to reach it without editing .env.local and redeploying.
 *
 * Order is deliberate. The official account goes first because that is the one
 * whose billing belongs to this project; a friend's account is a stopgap and
 * should only carry load when the official one cannot. A key that answers 402
 * is remembered as exhausted for the life of the process, so the next call
 * skips it rather than paying a round trip to be refused again. Restarting
 * clears that, which is the right default: topping up is exactly the thing
 * that makes an exhausted key good again.
 */

export type OpenRouterKey = {
  /** Stable id, used in logs and by the credit gauge. */
  id: "official" | "backup";
  /** What a person should see. */
  label: string;
  key: string;
};

/** Both keys, in the order they should be tried. Absent ones are dropped. */
export function openRouterKeys(): OpenRouterKey[] {
  const configured: OpenRouterKey[] = [
    { id: "official", label: "Official account", key: process.env.OPENROUTER_API_KEY ?? "" },
    { id: "backup", label: "Backup account", key: process.env.OPENROUTER_API_KEY_BACKUP ?? "" },
  ];
  return configured.filter((k) => k.key.length > 0);
}

/** Keys known to be out of credit, for this process only. */
const exhausted = new Set<string>();

function isOutOfCredit(status: number, body: string): boolean {
  return status === 402 || /insufficient credits|negative credit|requires more credits/i.test(body);
}

export type ChatResult =
  | { ok: true; response: Response; used: OpenRouterKey }
  | { ok: false; outOfCredit: boolean; status: number; detail: string };

/**
 * POST to chat/completions, moving to the next account on a credit refusal.
 *
 * Only a credit refusal fails over. A 400 is a bad request and would be a bad
 * request on either account; retrying it on the friend's key would spend their
 * money to get the same error twice.
 */
export async function openRouterChat(
  body: unknown,
  init: { signal?: AbortSignal } = {},
): Promise<ChatResult> {
  const keys = openRouterKeys();
  if (keys.length === 0) {
    return { ok: false, outOfCredit: false, status: 0, detail: "No OpenRouter key is configured." };
  }

  let lastStatus = 0;
  let lastDetail = "";
  let everOutOfCredit = false;

  for (const entry of keys) {
    if (exhausted.has(entry.key)) {
      everOutOfCredit = true;
      continue;
    }
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${entry.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: init.signal,
    });
    if (response.ok) return { ok: true, response, used: entry };

    // The body can only be read once, and it is needed to tell a credit
    // refusal from a malformed request.
    const detail = await response.text().catch(() => "");
    lastStatus = response.status;
    lastDetail = detail;

    if (isOutOfCredit(response.status, detail)) {
      everOutOfCredit = true;
      exhausted.add(entry.key);
      console.warn(`[openrouter] ${entry.label} is out of credit; trying the next account.`);
      continue;
    }
    return { ok: false, outOfCredit: false, status: response.status, detail };
  }

  return {
    ok: false,
    outOfCredit: everOutOfCredit,
    status: lastStatus,
    detail: everOutOfCredit
      ? "Every configured OpenRouter account is out of credit."
      : lastDetail,
  };
}

/** Lets a top-up take effect without a restart. */
export function forgetExhaustedKeys(): void {
  exhausted.clear();
}
