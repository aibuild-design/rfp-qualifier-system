import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, daysUntil } from "@/lib/rfp";

/**
 * The bids Khaled has said yes to.
 *
 * Deciding and writing are different jobs, days apart, and they were sharing
 * one page: a bid you had not judged yet showed you a proposal panel, and a bid
 * you had accepted still led with the reasoning you had already read and
 * agreed with. Neither half was doing the other any favours.
 *
 * So the queue is where a bid is judged, and this is where the accepted ones
 * are worked on. One row per bid, carrying only what matters once the decision
 * is made: who is confirmed, whether there is a draft, and the two links
 * anybody actually clicks.
 *
 * Membership is the human verdict, never the desk's. A proposal exists because
 * a person said to write one.
 */
export default async function ProposalsPage() {
  const supabase = await createClient();

  const { data: bids } = await supabase
    .from("rfps")
    .select("id,title,client_agency,status,human_verdict,score_percent,due_at,drive_folder_url,proposal_doc_url,filing_status")
    .not("human_verdict", "is", null)
    .neq("human_verdict", "no_go")
    .order("due_at", { ascending: true, nullsFirst: false });

  const ids = (bids ?? []).map((b) => b.id);

  // Fetched flat and stitched, the same as the bid page: the hand-written
  // Database types carry no relationship metadata, so an embedded select
  // resolves to `never`.
  const [{ data: sections }, { data: assignments }, { data: roster }] = await Promise.all([
    ids.length
      ? supabase.from("rfp_proposal_sections").select("rfp_id,status").in("rfp_id", ids)
      : Promise.resolve({ data: [] as { rfp_id: string; status: string }[] }),
    ids.length
      ? supabase
          .from("rfp_team_assignments")
          .select("rfp_id,team_member_id")
          .in("rfp_id", ids)
          .eq("status", "confirmed")
      : Promise.resolve({ data: [] as { rfp_id: string; team_member_id: string }[] }),
    supabase.from("team_members").select("id,name"),
  ]);

  const nameOf = new Map((roster ?? []).map((m) => [m.id, m.name]));
  const teamFor = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    const list = teamFor.get(a.rfp_id) ?? [];
    const n = nameOf.get(a.team_member_id);
    if (n) list.push(n);
    teamFor.set(a.rfp_id, list);
  }
  const draftedFor = new Map<string, number>();
  for (const s of sections ?? []) draftedFor.set(s.rfp_id, (draftedFor.get(s.rfp_id) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="rise mb-8">
        <h1 className="font-display text-2xl font-semibold text-rfp-ink">Proposals</h1>
        <p className="mt-1 text-sm text-rfp-ink-secondary">
          Bids you have accepted. The queue is for deciding; this is for writing.
        </p>
      </div>

      {(bids ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed border-rfp-border-strong bg-rfp-surface px-5 py-6 text-sm leading-relaxed text-rfp-ink-secondary">
          Nothing accepted yet. Open a bid in the{" "}
          <Link href="/dashboard" className="font-medium text-rfp-gold hover:underline">
            RFP queue
          </Link>{" "}
          and answer <strong>are you bidding this?</strong> at the bottom. Accepted bids appear
          here.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {(bids ?? []).map((bid) => {
            const team = teamFor.get(bid.id) ?? [];
            const drafted = draftedFor.get(bid.id) ?? 0;
            const days = bid.due_at ? daysUntil(bid.due_at) : null;

            return (
              <li
                key={bid.id}
                className="rounded-xl border border-rfp-border bg-rfp-surface p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/rfps/${bid.id}`}
                      className="press font-display text-base font-semibold text-rfp-ink hover:text-rfp-gold"
                    >
                      {bid.title}
                    </Link>
                    <p className="mt-0.5 text-sm text-rfp-ink-muted">{bid.client_agency}</p>
                  </div>
                  {bid.due_at && (
                    <p className="tabular shrink-0 text-sm text-rfp-ink-secondary">
                      Due {formatDate(bid.due_at)}
                      {days !== null && days >= 0 && (
                        <span className="text-rfp-ink-muted"> ({days}d)</span>
                      )}
                    </p>
                  )}
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-rfp-border pt-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
                      Draft
                    </dt>
                    <dd
                      className="mt-0.5 text-sm font-medium"
                      style={{ color: drafted ? "var(--rfp-good)" : "var(--rfp-warning)" }}
                    >
                      {drafted ? `${drafted} sections built` : "Not built yet"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
                      Confirmed team
                    </dt>
                    <dd className="mt-0.5 text-sm text-rfp-ink">
                      {team.length ? team.join(", ") : <span className="text-rfp-warning">Nobody yet</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
                      Filed
                    </dt>
                    <dd className="mt-0.5 text-sm text-rfp-ink">
                      {bid.filing_status === "filed" ? "In Drive" : "Not filed"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rfp-border pt-4">
                  <Link
                    href={`/dashboard/rfps/${bid.id}`}
                    className="press inline-flex min-h-11 items-center rounded-lg bg-rfp-ink px-4 text-sm font-semibold text-rfp-surface hover:opacity-90"
                  >
                    {drafted ? "Open the draft" : "Build the draft"}
                  </Link>
                  {bid.proposal_doc_url && (
                    <a
                      href={bid.proposal_doc_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="press inline-flex min-h-11 items-center rounded-lg border border-rfp-border px-4 text-sm font-semibold text-rfp-ink-secondary hover:bg-rfp-surface-sunken"
                    >
                      Open in Google Docs
                    </a>
                  )}
                  {drafted > 0 && (
                    <a
                      href={`/api/rfps/${bid.id}/docx`}
                      className="press inline-flex min-h-11 items-center rounded-lg border border-rfp-border px-4 text-sm font-semibold text-rfp-ink-secondary hover:bg-rfp-surface-sunken"
                    >
                      Download .docx
                    </a>
                  )}
                  {bid.drive_folder_url && (
                    <a
                      href={bid.drive_folder_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="press inline-flex min-h-11 items-center text-sm font-semibold text-rfp-gold underline decoration-rfp-gold/40 underline-offset-4 hover:decoration-rfp-gold"
                    >
                      Open in Drive
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
