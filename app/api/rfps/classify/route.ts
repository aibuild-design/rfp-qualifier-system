import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/api-auth";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import { classifyDocument } from "@/lib/document-kind";
import { budgetFromQa } from "@/lib/budget-from-qa";

/**
 * What kind of document is this, and does it belong to a bid already here?
 *
 * Called before triage, which is the whole point: an addendum read as a fresh
 * solicitation costs a full three-read pass and produces a second row for a
 * procurement already in the queue, scored on a two-page amendment, while the
 * bid it actually changes sits untouched with a deadline that has moved.
 *
 * Khaled supplied the case that proves it. A Clackamas County addendum and a
 * clarifying-questions set, both against RFP 2026-25, both of which the desk
 * would have filed as unrelated bids. The addendum moves a deadline and deletes
 * fifteen points of scoring weight; the answers reverse a page limit already
 * recorded as a compliance item.
 *
 * Attaching is done here rather than left to the caller so there is one path:
 * a workflow that classified correctly and then forgot to attach would be
 * worse than no classification, because the queue would look right.
 *
 * Fails open. Anything it cannot classify comes back as a solicitation, which
 * is exactly what happened before this route existed.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let text = "";
  let sourceUrl: string | null = null;
  let title: string | null = null;
  try {
    const body = (await req.json()) as { text?: string; source_url?: string; title?: string };
    text = String(body.text ?? "");
    sourceUrl = body.source_url ?? null;
    title = body.title ?? null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Too little to judge on. A short covering email is not evidence of anything,
  // and guessing "addendum" from two lines would suppress a real solicitation.
  if (text.trim().length < 200) {
    return NextResponse.json({ kind: "solicitation", reason: "too short to classify", attached: false });
  }

  const classified = classifyDocument(text);

  if (classified.kind === "solicitation" || !isServiceRoleConfigured) {
    return NextResponse.json({ ...classified, attached: false });
  }

  // A notice is not a solicitation, but it is also not an amendment to one: it
  // advertises a document that has not arrived. Treated as a solicitation so it
  // still reaches the queue, with the attachment named on the record, because
  // the useful action is fetching the file it points at.
  if (classified.kind === "notice") {
    return NextResponse.json({ ...classified, attached: false, treat_as: "solicitation" });
  }

  if (!classified.solicitationNumber) {
    return NextResponse.json({
      ...classified,
      attached: false,
      treat_as: "solicitation",
      reason: "no solicitation number, so there is nothing to attach it to",
    });
  }

  const supabase = createServiceRoleClient();
  const { data: parent } = await supabase
    .from("rfps")
    .select("id, title, solicitation_number")
    .eq("solicitation_number", classified.solicitationNumber)
    .maybeSingle();

  if (!parent) {
    // The amendment arrived before the solicitation, which happens when a
    // forward is missed. Triaged on its own so it is at least visible, rather
    // than dropped for having nowhere to go.
    return NextResponse.json({
      ...classified,
      attached: false,
      treat_as: "solicitation",
      reason: `no bid found for ${classified.solicitationNumber}`,
    });
  }

  await supabase.from("rfp_related_documents").insert({
    rfp_id: parent.id,
    kind: classified.kind,
    sequence: classified.sequence,
    title,
    body: text,
    source_url: sourceUrl,
  });

  // A budget that only appears in the answers.
  //
  // Module 5 asks for this by name: a number that shows up only in the Q&A
  // still has to land on the card. Applied only when the bid has none, so an
  // answer can fill a gap but never overwrite a figure read from the
  // solicitation itself, which remains the better source.
  let budgetNote: string | null = null;
  if (classified.kind === "clarifying_questions") {
    const { data: bid } = await supabase
      .from("rfps")
      .select("budget_amount")
      .eq("id", parent.id)
      .maybeSingle();

    if (bid && bid.budget_amount === null) {
      const found = budgetFromQa(text);
      if (found.found) {
        await supabase
          .from("rfps")
          .update({ budget_amount: found.amount, budget_source: "qa_document" })
          .eq("id", parent.id);
        budgetNote = `Budget of $${found.amount.toLocaleString("en-US")} taken from the answers, which the solicitation did not state.`;
      } else if (found.reason === "explicitly none") {
        budgetNote = "The agency was asked about budget and said none is established.";
      }
    }
  }

  // Deliberately not re-triaged. An amendment can move a deadline, reweight
  // scoring or reverse a page limit, and what that means for a bid already
  // accepted is a judgement rather than arithmetic. Flagging it means the
  // change is visible and nothing was silently recomputed under a decision
  // somebody already made.
  await supabase.from("rfps").update({ has_unreviewed_amendment: true }).eq("id", parent.id);

  return NextResponse.json({
    ...classified,
    attached: true,
    rfp_id: parent.id,
    attached_to: parent.title,
    budget_note: budgetNote,
  });
}
