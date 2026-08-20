import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runHealthChecks, healthMessage, type Check } from "@/lib/health";
import type { Database } from "@/lib/supabase/types";

/**
 * Run the dependency checks and say something in Slack when they fail.
 *
 * Called on a schedule rather than on page load: the failures worth announcing
 * are the ones nobody is looking at the screen for. A GET with the shared key
 * so n8n can drive it the same way it drives everything else.
 *
 * Announced once per outage, not once per check. `last_alerted_at` is stamped
 * when a warning goes out and cleared the moment the connection recovers, so
 * the next failure is heard rather than muted along with the last one.
 */

/** Long enough that a wobbly connection does not become a chat channel. */
const REMIND_AFTER_HOURS = 24;

export async function GET(req: NextRequest) {
  const key = process.env.RFP_INTAKE_API_KEY;
  const presented =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.nextUrl.searchParams.get("key");
  if (!key || presented !== key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const checks = await runHealthChecks(supabase);
  const failing = checks.filter((c) => !c.ok);

  // Recovered connections forget they were ever complained about, so the next
  // failure is announced instead of being suppressed by a stale timestamp.
  for (const c of checks.filter((c) => c.ok)) {
    await supabase.from("connection_events").update({ last_alerted_at: null }).eq("kind", c.kind);
  }

  const { data: rows } = await supabase.from("connection_events").select("kind, last_alerted_at");
  const alertedAt = new Map((rows ?? []).map((r) => [r.kind, r.last_alerted_at]));
  const cutoff = Date.now() - REMIND_AFTER_HOURS * 60 * 60 * 1000;

  const toAnnounce = failing.filter((c) => {
    const last = alertedAt.get(c.kind);
    return !last || new Date(last).getTime() < cutoff;
  });

  let posted = false;
  if (toAnnounce.length) {
    const { data: settings } = await supabase
      .from("scoring_settings")
      .select("slack_webhook_url")
      .eq("id", true)
      .maybeSingle();
    const url = settings?.slack_webhook_url?.trim();
    if (url) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(healthMessage(toAnnounce)),
          signal: AbortSignal.timeout(8000),
        });
        posted = res.ok;
      } catch {
        posted = false;
      }
    }
    // Stamped whether or not Slack accepted it. A webhook that is failing is
    // not a reason to retry the same warning every few minutes.
    //
    // Updated in place where the row exists, so a connection that is failing
    // right now does not get `last_ok_at` moved forward to say it just worked.
    // Only a kind with no row at all is inserted, and the timestamp there is
    // the epoch rather than the present for the same reason.
    const now = new Date().toISOString();
    for (const c of toAnnounce) {
      const { data: updated } = await supabase
        .from("connection_events")
        .update({ last_alerted_at: now })
        .eq("kind", c.kind)
        .select("kind");
      if (!updated?.length) {
        await supabase
          .from("connection_events")
          .insert({ kind: c.kind, last_ok_at: new Date(0).toISOString(), last_alerted_at: now });
      }
    }
  }

  return NextResponse.json({
    healthy: failing.length === 0,
    blocking: failing.some((c: Check) => c.blocking),
    announced: toAnnounce.map((c) => c.kind),
    posted_to_slack: posted,
    checks,
  });
}
