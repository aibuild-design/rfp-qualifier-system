import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/api-auth";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import {
  DEFAULT_IGNORE_TERMS,
  DEFAULT_SUBJECT_TERMS,
  explicitlyExcluded,
  namedAsSolicitation,
  sentByTheDesk,
} from "@/lib/intake-filter";
import { screenUnmatched } from "@/lib/intake-classifier";

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

  const parsed = emails.map((raw) => {
    const email = (raw ?? {}) as Record<string, unknown>;
    const attachments = Array.isArray(email.attachments)
      ? (email.attachments as unknown[]).map((a) =>
          typeof a === "string" ? a : ((a as Record<string, unknown>)?.fileName as string | undefined),
        )
      : [];
    return {
      subject: typeof email.subject === "string" ? email.subject : null,
      body: typeof email.body === "string" ? email.body : null,
      attachments,
    };
  });

  // Three tiers, cheapest first.
  //
   //  self      the desk's own verdict email. Never re-enters, whatever it says
  //   excluded  an ignore term matched anywhere. Khaled's explicit veto, and it
  //             beats everything, including the model
  //   terms     a term matched the subject or an attachment name. That is the
  //             email announcing what it is, so it is admitted without a model
  //   model     everything else, which is read
  //
  // The middle tier is deliberately narrower than the term rule used to be. A
  // term matching in the body was enough to admit an email, and a bank statement
  // whose footer reads "this does not constitute a solicitation" was admitted on
  // that footer with no model ever seeing it. A word in a body is weak evidence
  // and now goes to be read like anything else.
  //
  // Index carried back rather than assumed, so n8n can keep whichever items the
  // answer refers to without relying on the order surviving the round trip.
  const results = parsed.map((email, index) => {
    if (sentByTheDesk(email)) {
      return { index, qualifies: false, decided_by: "excluded" as const, reason: "The desk's own verdict email." };
    }
    if (explicitlyExcluded(email, filter.ignoreTerms)) {
      return { index, qualifies: false, decided_by: "excluded" as const, reason: "Matched an excluded term." };
    }
    return {
      index,
      qualifies: namedAsSolicitation(email, filter.terms),
      decided_by: "terms" as "terms" | "model" | "model_unavailable" | "excluded",
      reason: "",
    };
  });

  /**
   * Then read what the list did not recognise.
   *
   * A word list can only find what somebody remembered to type into it, and the
   * case it can never reach is a colleague forwarding a solicitation under the
   * subject "Re: Thursday". Nothing in the subject, the attachment name or the
   * terms says anything; every word in the body says it.
   *
   * Only the unmatched go to the model, so an inbox of ordinary solicitations
   * costs nothing extra and the screening is spent on the mail that actually
   * needs judgement. It reads a few hundred words and answers yes or no, which
   * is a different job from the three reads triage does of the document itself.
   *
   * Never used to reject. Anything the terms accepted is kept whatever the model
   * thinks, because the term list is Khaled's explicit instruction and a
   * screening pass should not be able to overrule it.
   */
  const unmatched = results
    .filter((r) => !r.qualifies && r.decided_by !== "excluded")
    .map((r) => ({ index: r.index, email: parsed[r.index] }));
  let screened = 0;
  if (unmatched.length > 0) {
    const verdicts = await screenUnmatched(unmatched, AbortSignal.timeout(45000));
    for (const r of results) {
      if (r.decided_by === "excluded") continue;
      const v = verdicts.get(r.index);
      if (!v) {
        // Reached only when the model could not be. The term list stands, and
        // the reason says so, because "why did the desk not see this" needs an
        // answer that is not silence.
        if (!r.qualifies) {
          r.decided_by = "model_unavailable";
          r.reason = "Nothing in the subject or attachment names matched, and the screening model could not be reached.";
        }
        continue;
      }
      screened++;
      r.qualifies = v.qualifies;
      r.decided_by = "model";
      r.reason = v.reason;
    }
  }

  return NextResponse.json({
    source,
    screened,
    kept: results.filter((r) => r.qualifies).map((r) => r.index),
    results,
  });
}
