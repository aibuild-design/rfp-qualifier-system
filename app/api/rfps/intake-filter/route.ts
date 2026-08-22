import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/api-auth";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import { DEFAULT_IGNORE_TERMS, DEFAULT_SUBJECT_TERMS, emailQualifies } from "@/lib/intake-filter";

/**
 * Which emails n8n should treat as a solicitation.
 *
 * Asked once per email, before anything expensive happens. The alternative was
 * a hardcoded search query inside the Gmail trigger, which meant the rule
 * deciding what the desk even sees lived somewhere Khaled could not read, and
 * changing it meant editing a workflow.
 *
 * Deliberately its own endpoint rather than part of /api/rfps/context: context
 * is fetched once a solicitation is already being triaged, which is far too
 * late to decide whether it should be.
 *
 * Fails open. If this route is unreachable n8n keeps its built-in defaults
 * rather than filtering everything out - a settings lookup failing should not
 * silently stop the desk receiving work.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceRoleConfigured) {
    return NextResponse.json(FALLBACK);
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("scoring_settings")
    .select("email_subject_terms, email_ignore_terms")
    .eq("id", true)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(FALLBACK);
  }

  const clean = (list: string[] | null | undefined) =>
    (list ?? []).map((t) => t.trim()).filter(Boolean);

  // An empty list is a real choice - "show me everything" - and is passed
  // through as such rather than being replaced by the defaults, which would
  // make the setting impossible to clear.
  return NextResponse.json({
    subject_terms: clean(data.email_subject_terms),
    ignore_terms: clean(data.email_ignore_terms),
    source: "settings",
  });
}

/** What n8n gets when settings cannot be read. Named so the two places that
 *  return it cannot drift into disagreeing about what "no settings" means. */
const FALLBACK = {
  subject_terms: DEFAULT_SUBJECT_TERMS,
  ignore_terms: DEFAULT_IGNORE_TERMS,
  source: "default",
} as const;

/**
 * Decide, rather than describe.
 *
 * GET hands n8n the term list and lets it do the matching, which meant the rule
 * had two implementations: this file, and a Code node inside the workflow. They
 * drifted, as two copies of one rule always do. The n8n copy never applied the
 * ignore list at all, so `email_ignore_terms` rendered in Settings, saved to the
 * database and had no effect on a single email; it matched plain substrings, so
 * "surfperch" qualified as an RFP; and it never looked at attachment names,
 * which is where agencies routinely put the solicitation number when the
 * subject just says "Please see attached".
 *
 * POST takes the emails and returns which of them qualify. One implementation,
 * in the half of the system that owns rules, and a fix here reaches production
 * without anybody editing a workflow.
 *
 * Batched, because a Gmail poll returns everything since the last check and one
 * request per email would turn a quiet morning into thirty round trips.
 *
 * Fails open in the same way GET does: an unreadable settings row filters on the
 * defaults rather than dropping the mail.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { emails?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const emails = Array.isArray(body.emails) ? body.emails : null;
  if (!emails) {
    return NextResponse.json({ error: "emails must be an array" }, { status: 400 });
  }

  let filter = {
    terms: [...DEFAULT_SUBJECT_TERMS] as string[],
    ignoreTerms: [...DEFAULT_IGNORE_TERMS] as string[],
  };
  let source = "default";

  if (isServiceRoleConfigured) {
    const { data } = await createServiceRoleClient()
      .from("scoring_settings")
      .select("email_subject_terms, email_ignore_terms")
      .eq("id", true)
      .maybeSingle();
    if (data) {
      const clean = (list: string[] | null | undefined) =>
        (list ?? []).map((t) => String(t ?? "").trim()).filter(Boolean);
      filter = {
        terms: clean(data.email_subject_terms),
        ignoreTerms: clean(data.email_ignore_terms),
      };
      source = "settings";
    }
  }

  // Index carried back rather than assumed, so n8n can keep whichever items the
  // answer refers to without relying on the order surviving the round trip.
  const results = emails.map((raw, index) => {
    const email = (raw ?? {}) as Record<string, unknown>;
    const attachments = Array.isArray(email.attachments)
      ? (email.attachments as unknown[]).map((a) =>
          typeof a === "string" ? a : ((a as Record<string, unknown>)?.fileName as string | undefined),
        )
      : [];
    return {
      index,
      qualifies: emailQualifies(
        {
          subject: typeof email.subject === "string" ? email.subject : null,
          body: typeof email.body === "string" ? email.body : null,
          attachments,
        },
        filter,
      ),
    };
  });

  return NextResponse.json({
    source,
    kept: results.filter((r) => r.qualifies).map((r) => r.index),
    results,
  });
}
