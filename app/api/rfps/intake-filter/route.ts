import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/api-auth";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import { DEFAULT_IGNORE_TERMS, DEFAULT_SUBJECT_TERMS } from "@/lib/intake-filter";

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
    .select("email_subject_terms, email_ignore_terms, intake_match_body")
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
    // Defaults to on when the column has not been added yet, matching the
    // migration, so a database mid-deploy behaves the same as one that is done.
    match_body: data.intake_match_body ?? true,
    source: "settings",
  });
}

/** What n8n gets when settings cannot be read. Named so the two places that
 *  return it cannot drift into disagreeing about what "no settings" means. */
const FALLBACK = {
  subject_terms: DEFAULT_SUBJECT_TERMS,
  ignore_terms: DEFAULT_IGNORE_TERMS,
  match_body: true,
  source: "default",
} as const;
