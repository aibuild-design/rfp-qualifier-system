import { NextRequest, NextResponse } from "next/server";
import { Packer } from "docx";
import { createClient } from "@/lib/supabase/server";
import { buildProposalDocx } from "@/lib/docx-export";
import { caravannLogo } from "@/lib/brand-logo";
import { proposalFileName } from "@/lib/proposal";

// Downloads the assembled draft as a Word document.
//
// Uses the caller's own session rather than the service-role client, so RLS
// applies: someone who isn't allowlisted gets an empty result and a 404, not
// a proposal. This is the one route that emits a whole document, so it is the
// one where an authorisation slip would leak the most.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const [{ data: rfp }, { data: sections }] = await Promise.all([
    supabase.from("rfps").select("*").eq("id", id).maybeSingle(),
    supabase.from("rfp_proposal_sections").select("*").eq("rfp_id", id).order("sort_order"),
  ]);

  if (!rfp) {
    return NextResponse.json({ error: "RFP not found" }, { status: 404 });
  }
  if (!sections || sections.length === 0) {
    return NextResponse.json(
      { error: "No draft yet - build one from the RFP page first." },
      { status: 409 }
    );
  }

  // The tailored text is what ships when it exists. Tailoring a section and
  // then downloading the untailored original would make the whole pass
  // theatre, and the difference would only surface after submission.
  const shipped = sections.map((s) => (s.tailored_body ? { ...s, body: s.tailored_body } : s));

  const doc = buildProposalDocx(rfp, shipped, (await caravannLogo()) ?? undefined);
  const buffer = await Packer.toBuffer(doc);
  const fileName = `${proposalFileName(rfp)}.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      // RFC 5987 encoding so the em dashes and accents in real solicitation
      // titles survive the header intact.
      "Content-Disposition": `attachment; filename="proposal.docx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
