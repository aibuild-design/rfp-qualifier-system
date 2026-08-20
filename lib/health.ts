import type { SupabaseClient } from "@supabase/supabase-js";
import { openRouterCredit } from "@/lib/openrouter-credit";
import type { Database } from "@/lib/supabase/types";

/**
 * Whether the things this desk depends on are actually working.
 *
 * Every one of these fails quietly. OpenRouter running out of credit does not
 * throw anywhere a person can see: triage stops returning verdicts and written
 * proposal sections fall back to stitched library text, so the draft still
 * appears and is simply worse. n8n being down means email stops arriving and
 * the queue just looks like a slow week. Drive failing means a bid folder is
 * never created and nobody finds out until they go looking for the document.
 *
 * A missing thing looks identical to nothing happening, which is why this is
 * checked on a schedule and announced rather than left on a page to be noticed.
 */

export type Check = {
  kind: string;
  ok: boolean;
  /** True when it is broken enough to stop work, rather than merely worth knowing. */
  blocking: boolean;
  detail: string;
};

/** How long a connection that used to work may go quiet before it is suspect. */
const STALE_DAYS = 21;

export async function runHealthChecks(supabase: SupabaseClient<Database>): Promise<Check[]> {
  const checks: Check[] = [];

  // Money. The one that stops everything and says nothing.
  const credit = await openRouterCredit(process.env.OPENROUTER_API_KEY);
  if (!credit) {
    checks.push({
      kind: "openrouter",
      ok: false,
      blocking: true,
      detail: "OpenRouter did not answer, so no solicitation can be read.",
    });
  } else if (credit.level !== "ok") {
    checks.push({
      kind: "openrouter",
      ok: false,
      blocking: credit.level === "empty",
      detail:
        credit.level === "empty"
          ? `OpenRouter has $${credit.remaining.toFixed(2)} left. Nothing is being triaged and proposals are falling back to library text. Top up at openrouter.ai/settings/credits.`
          : `OpenRouter is down to $${credit.remaining.toFixed(2)}, about ${credit.solicitationsLeft} more solicitation${credit.solicitationsLeft === 1 ? "" : "s"}.`,
    });
  } else {
    checks.push({ kind: "openrouter", ok: true, blocking: false, detail: `$${credit.remaining.toFixed(2)} left.` });
  }

  // The workflow that fetches the email. If it is off, nothing arrives.
  const base = process.env.N8N_BASE_URL?.replace(/\/$/, "");
  const key = process.env.N8N_API_KEY;
  if (base && key) {
    try {
      const res = await fetch(`${base}/api/v1/workflows?limit=50`, {
        headers: { "X-N8N-API-KEY": key },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!res.ok) {
        checks.push({ kind: "n8n", ok: false, blocking: true, detail: `n8n answered ${res.status}. Email intake is not running.` });
      } else {
        const body = await res.json();
        const flows = (body?.data ?? []) as { name: string; active: boolean }[];
        const idle = flows.filter((w) => !w.active).map((w) => w.name);
        checks.push(
          idle.length
            ? { kind: "n8n", ok: false, blocking: true, detail: `Workflow not running: ${idle.join(", ")}. Solicitations will not arrive.` }
            : { kind: "n8n", ok: true, blocking: false, detail: `${flows.length} workflow(s) active.` },
        );
      }
    } catch (e) {
      checks.push({ kind: "n8n", ok: false, blocking: true, detail: `n8n unreachable: ${e instanceof Error ? e.message : "unknown"}.` });
    }
  }

  // Connections that demonstrably worked once and have gone quiet since.
  //
  // Only ones with a recorded success are judged. "Never worked" is not a
  // failure on a desk that has not filed anything yet, and reporting it as one
  // would make the first week of use nothing but false alarms.
  // Only connections nothing above already answered for.
  //
  // OpenRouter and n8n are checked live, so their row here is not evidence of
  // anything - and it actively misled: stamping an alert created an
  // `openrouter` row, the next run read that row, declared OpenRouter healthy
  // on the strength of a timestamp the alert itself had written, cleared the
  // "already warned" mark and announced the same outage again.
  const activelyChecked = new Set(checks.map((c) => c.kind));
  const { data: events } = await supabase.from("connection_events").select("kind, last_ok_at, detail");
  const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  for (const e of (events ?? []) as { kind: string; last_ok_at: string }[]) {
    if (activelyChecked.has(e.kind)) continue;
    const last = new Date(e.last_ok_at).getTime();
    if (!Number.isFinite(last)) continue;
    const days = Math.floor((Date.now() - last) / (24 * 60 * 60 * 1000));
    checks.push(
      last < cutoff
        ? { kind: e.kind, ok: false, blocking: false, detail: `${e.kind} last worked ${days} days ago.` }
        : { kind: e.kind, ok: true, blocking: false, detail: `worked ${days} day(s) ago.` },
    );
  }

  return checks;
}

/** Deliberately plain. A health alert competes with real work for attention. */
export function healthMessage(failing: Check[]): Record<string, unknown> {
  const worst = failing.some((c) => c.blocking);
  return {
    text: worst ? "The bid desk has stopped working" : "The bid desk needs attention",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${worst ? "The bid desk has stopped working" : "The bid desk needs attention"}*\n${failing
            .map((c) => `• ${c.detail}`)
            .join("\n")}`,
        },
      },
    ],
  };
}
