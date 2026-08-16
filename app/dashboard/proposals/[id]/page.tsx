import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProposalDraft } from "@/components/ProposalDraft";
import { StandingDocuments } from "@/components/StandingDocuments";
import { FilingStatusCard } from "@/components/FilingStatusCard";
import { proposalFileName } from "@/lib/proposal";
import { formatDate } from "@/lib/rfp";

/**
 * One proposal, and everything that belongs to writing it.
 *
 * The fourteen-section list, the standing documents and the filing card all
 * used to sit on the bid page underneath the reasoning. That put a document you
 * work on for days below an argument you read once and agreed with, and it made
 * the bid page long enough that people stopped scrolling to the decision at the
 * bottom of it.
 *
 * The bid page keeps the judgement. This keeps the work.
 */
export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: rfp }, { data: sections }, { count: libraryCount }, { data: standingDocs }] =
    await Promise.all([
      supabase.from("rfps").select("*").eq("id", id).maybeSingle(),
      supabase.from("rfp_proposal_sections").select("*").eq("rfp_id", id).order("sort_order"),
      supabase.from("language_blocks").select("*", { count: "exact", head: true }),
      supabase.from("standing_documents").select("id, label, file_name, expires_on").order("label"),
    ]);

  if (!rfp) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/dashboard/proposals"
        className="press text-sm font-medium text-rfp-ink-muted hover:text-rfp-gold"
      >
        &larr; All proposals
      </Link>

      <div className="rise mt-4 rounded-xl border border-rfp-border bg-rfp-surface p-6">
        <h1 className="font-display text-xl font-semibold leading-snug text-rfp-ink">{rfp.title}</h1>
        <p className="mt-1 text-sm text-rfp-ink-muted">{rfp.client_agency}</p>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rfp-border pt-4">
          {rfp.due_at && (
            <p className="tabular text-sm text-rfp-ink-secondary">Due {formatDate(rfp.due_at)}</p>
          )}
          <Link
            href={`/dashboard/rfps/${rfp.id}`}
            className="press inline-flex min-h-11 items-center text-sm font-semibold text-rfp-gold underline decoration-rfp-gold/40 underline-offset-4 hover:decoration-rfp-gold"
          >
            The verdict and reasoning
          </Link>
          {/* The Doc first. Downloading a .docx to read your own draft is a
              detour when the same document is already open-able in a tab. */}
          {rfp.proposal_doc_url && (
            <a
              href={rfp.proposal_doc_url}
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex min-h-11 items-center rounded-lg bg-rfp-ink px-4 text-sm font-semibold text-rfp-surface hover:opacity-90"
            >
              Open in Google Docs
            </a>
          )}
          {rfp.drive_folder_url && (
            <a
              href={rfp.drive_folder_url}
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex min-h-11 items-center text-sm font-semibold text-rfp-gold underline decoration-rfp-gold/40 underline-offset-4 hover:decoration-rfp-gold"
            >
              Open in Drive
            </a>
          )}
        </div>

        {rfp.cost_lane_note && (
          <p className="mt-4 rounded-lg bg-rfp-surface-sunken px-4 py-3 text-sm leading-relaxed text-rfp-ink-secondary">
            <span className="font-semibold text-rfp-ink">How to price this. </span>
            {rfp.cost_lane_note}
          </p>
        )}
      </div>

      <ProposalDraft
        rfpId={rfp.id}
        sections={sections ?? []}
        fileName={proposalFileName(rfp)}
        libraryCount={libraryCount ?? 0}
      />

      <StandingDocuments docs={standingDocs ?? []} />

      <FilingStatusCard rfp={rfp} />
    </div>
  );
}
