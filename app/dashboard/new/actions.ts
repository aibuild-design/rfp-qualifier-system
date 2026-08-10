"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { lookup } from "node:dns/promises";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser, safeError, type ActionResult } from "@/lib/auth";
import { checkDocumentUrl, isBlockedHost } from "@/lib/url-guard";

/**
 * Submits a solicitation for triage from the dashboard.
 *
 * Triage takes 40-90 seconds - a full 1M-context read of the document - which
 * is far too long to hold a form submission open, and long enough to hit a
 * serverless timeout. So this returns immediately and the work continues in
 * the background:
 *
 *   1. Insert a `pending` row so the solicitation appears in the queue at once
 *      and the person can see their submission landed.
 *   2. after() fires the n8n webhook once the response has been sent.
 *   3. n8n POSTs the finished verdict to /api/rfps/intake, which upserts on
 *      external_id - replacing the pending row rather than duplicating it.
 *
 * If triage fails the row stays `pending` rather than vanishing, which is the
 * honest failure mode: something was submitted and did not get a verdict, and
 * that should be visible rather than silently swallowed.
 */
export async function submitSolicitation(input: {
  title: string;
  client_agency: string;
  document_url?: string;
  document_text?: string;
}): Promise<ActionResult<{ id: string; warning: string }>> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;

  const title = input.title.trim();
  const agency = input.client_agency.trim();
  const rawUrl = input.document_url?.trim();
  const text = input.document_text?.trim();

  if (!title || !agency) return { error: "Title and agency are required" };
  if (!rawUrl && !text) {
    return { error: "Paste the solicitation text or give a link to the document" };
  }

  // n8n fetches whatever link it is handed, so the check happens before the
  // link is stored - not at fetch time, when it is already someone else's
  // process. See lib/url-guard.ts for what this does and does not cover.
  let url: string | undefined;
  if (rawUrl) {
    const checked = checkDocumentUrl(rawUrl);
    if (!checked.ok) return { error: checked.error };
    url = checked.url;

    // A public name is allowed to resolve to a private address. Resolving it
    // here catches the ordinary version of that; it cannot catch a record that
    // changes between this lookup and n8n's fetch.
    try {
      const addresses = await lookup(new URL(url).hostname, { all: true });
      if (addresses.some((a) => isBlockedHost(a.address))) {
        return { error: "That link resolves to a private address, so it cannot be fetched" };
      }
    } catch {
      return { error: "That link's host could not be found" };
    }
  }

  // Distinct from anything n8n generates, so a manual submission can never
  // collide with an email- or aggregator-sourced one for the same solicitation.
  const externalId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { data: row, error } = await supabase
    .from("rfps")
    .insert({
      external_id: externalId,
      title,
      client_agency: agency,
      source: "manual",
      source_url: url || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) return safeError("submit the solicitation", error);

  const base = process.env.N8N_BASE_URL?.replace(/\/$/, "");
  const key = process.env.RFP_INTAKE_API_KEY;

  if (!base || !key) {
    // The row is already in the queue, so say plainly that it will sit there.
    return {
      ok: true,
      id: row.id,
      warning:
        "Saved to the queue, but triage is not configured on this deployment " +
        "(N8N_BASE_URL / RFP_INTAKE_API_KEY missing), so no verdict will arrive.",
    };
  }

  after(async () => {
    try {
      const res = await fetch(`${base}/webhook/rfp-intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          external_id: externalId,
          title,
          client_agency: agency,
          source: "manual",
          ...(url ? { document_url: url } : { document_text: text }),
        }),
      });
      if (!res.ok) {
        // Recorded on the row itself so the failure is visible in the UI rather
        // than only in a log nobody reads.
        const admin = createServiceRoleClient();
        await admin
          .from("rfps")
          .update({ verdict_why_not: `Triage failed: n8n returned ${res.status}.` })
          .eq("external_id", externalId);
      }
    } catch (err) {
      const admin = createServiceRoleClient();
      await admin
        .from("rfps")
        .update({
          verdict_why_not: `Triage could not be reached: ${err instanceof Error ? err.message : "unknown error"}.`,
        })
        .eq("external_id", externalId);
    }
  });

  // Both surfaces show the new row: the queue lists it, the overview counts it.
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/overview");
  return { ok: true, id: row.id };
}
