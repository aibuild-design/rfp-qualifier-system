import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/rfp";

/**
 * One stored build, read back.
 *
 * Routed by the version's own id, not the bid's, so a link to a draft keeps
 * pointing at that draft after five more rebuilds. It sits under
 * /proposals/versions/ rather than /proposals/<id>/read because the segment in
 * that path is named for the bid, and putting a version id in it would make
 * every reader of the URL wrong about what they were looking at.
 *
 * Plain text on purpose. This is the draft as it was, not a working copy: it
 * cannot be edited, and rendering it as an editor would invite someone to try.
 */
export default async function ReadVersionPage({
  params,
}: {
  params: Promise<{ versionId: string }>;
}) {
  const { versionId } = await params;
  const supabase = await createClient();

  const { data: version } = await supabase
    .from("proposal_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  if (!version) notFound();

  const { data: rfp } = await supabase
    .from("rfps")
    .select("id, title, client_agency")
    .eq("id", version.rfp_id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/dashboard/proposals/${version.rfp_id}`}
        className="press text-sm font-medium text-rfp-ink-muted hover:text-rfp-gold"
      >
        &larr; Back to the current draft
      </Link>

      <div className="rise mt-4 rounded-xl border border-rfp-border bg-rfp-surface p-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
          Version {version.version}, kept as it was built
        </p>
        <h1 className="mt-2 font-display text-xl font-semibold leading-snug text-rfp-ink">
          {rfp?.title ?? "This proposal"}
        </h1>
        <p className="mt-1 text-sm text-rfp-ink-muted">{rfp?.client_agency}</p>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rfp-border pt-4 text-sm text-rfp-ink-secondary">
          <span>Built {formatDateTime(version.created_at)}</span>
          <span className="tabular">{version.word_count.toLocaleString()} words</span>
          <span
            className="tabular"
            style={{ color: version.written_count === 0 ? "var(--rfp-warning)" : undefined }}
          >
            {version.written_count} of {version.section_count} written for the bid
          </span>
          {version.doc_url && (
            <a
              href={version.doc_url}
              target="_blank"
              rel="noopener noreferrer"
              className="press font-semibold text-rfp-gold underline decoration-rfp-gold/40 underline-offset-4 hover:decoration-rfp-gold"
            >
              Open its Doc
            </a>
          )}
        </div>

        {version.written_count === 0 && (
          <p className="mt-4 rounded-lg border border-rfp-warning/30 bg-rfp-warning/5 px-4 py-3 text-sm leading-relaxed text-rfp-ink-secondary">
            Nothing in this build was written for the solicitation. Every section came from the
            approved-language library, which is what a draft looks like when the composer could not
            run.
          </p>
        )}
      </div>

      <article className="mt-6 rounded-xl border border-rfp-border bg-rfp-surface p-6">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-rfp-ink-secondary">
          {version.body}
        </pre>
      </article>
    </div>
  );
}
