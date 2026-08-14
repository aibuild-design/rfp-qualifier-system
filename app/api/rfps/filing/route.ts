import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/api-auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import type { TableUpdate } from "@/lib/supabase/types";

/**
 * Where a bid ended up in Drive.
 *
 * Filing happens after the verdict is already saved: n8n creates the folder,
 * uploads the solicitation and the proposal, and until now told nobody. The
 * files were genuinely in Drive while the dashboard's filing card sat on "Not
 * filed" forever - the one state it could never leave.
 *
 * A separate endpoint rather than a second field on intake, because the two
 * facts are known at different times. Intake answers "what did the desk
 * decide"; this answers "and where did the paperwork go", which is only known
 * several nodes later and can fail on its own without the verdict being wrong.
 *
 * Accepts either id or external_id. n8n has the id from the intake response,
 * but external_id is what survives a re-triage, and a filing report that cannot
 * find its row is worse than one that takes either key.
 */

const STATUSES = ["not_filed", "pending", "filed", "failed"] as const;
type FilingStatus = (typeof STATUSES)[number];

type Body = {
  id?: string;
  external_id?: string;
  filing_status?: FilingStatus;
  drive_folder_url?: string | null;
  filing_error?: string | null;
};

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id && !body.external_id) {
    return NextResponse.json({ error: "id or external_id is required" }, { status: 400 });
  }

  const status = body.filing_status ?? "filed";
  if (!STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `filing_status must be one of ${STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!isServiceRoleConfigured) {
    return NextResponse.json({ error: "Server is not configured to write" }, { status: 503 });
  }

  const patch: TableUpdate<"rfps"> = {
    filing_status: status,
    // Only stamped on success. A failed attempt that overwrote filed_at would
    // claim the bid was filed at the moment it wasn't.
    filed_at: status === "filed" ? new Date().toISOString() : null,
    // Cleared on success, so a folder that failed once and then filed does not
    // keep showing the old error underneath a green badge.
    filing_error: status === "failed" ? (body.filing_error ?? "Filing did not complete") : null,
  };
  if (body.drive_folder_url !== undefined) {
    patch.drive_folder_url = body.drive_folder_url;
  }

  const supabase = createServiceRoleClient();
  const query = supabase.from("rfps").update(patch);
  const { data, error } = await (body.id
    ? query.eq("id", body.id)
    : query.eq("external_id", body.external_id!)
  )
    .select("id,filing_status,drive_folder_url")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "No solicitation matched" }, { status: 404 });
  }

  // Drive demonstrably worked, so record that independently of the queue. The
  // Connections panel reads this rather than counting filed rows, so clearing
  // the queue no longer erases the proof that filing works. Best effort: a
  // health stamp must never turn a successful filing into an error.
  if (status === "filed") {
    const { error: healthError } = await supabase.from("connection_events").upsert(
      { kind: "drive", last_ok_at: new Date().toISOString(), detail: data.drive_folder_url ?? null },
      { onConflict: "kind" }
    );
    if (healthError) {
      console.warn(`[filing] could not stamp connection health: ${healthError.message}`);
    }
  }

  return NextResponse.json({ ok: true, ...data });
}
