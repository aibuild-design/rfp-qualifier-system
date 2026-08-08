import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VerdictBadge } from "@/components/VerdictBadge";
import { DemoTag } from "@/components/DemoBanner";
import { QuestionMemo } from "@/components/QuestionMemo";
import { TeamMatch } from "@/components/TeamMatch";
import { ProposalDraft } from "@/components/ProposalDraft";
import { FilingStatusCard } from "@/components/FilingStatusCard";
import { proposalFileName } from "@/lib/proposal";
import { daysUntil, deadlineColor, deadlineWindowsFrom, formatBudget, formatDate, formatDeadline } from "@/lib/rfp";

const GAP_TYPE_LABEL: Record<string, string> = {
  experience: "Experience",
  sector: "Sector depth",
  certification: "Certification",
  staffing: "Staffing",
  geography: "Geography",
  other: "Other",
};

const COMPLIANCE_CATEGORY_LABEL: Record<string, string> = {
  deadline: "Deadline",
  page_limit: "Page limit",
  format: "Format",
  submission: "Submission",
  insurance: "Insurance",
  rubric: "Rubric",
  other: "Other",
};

export default async function RfpDetailPage({ params }: PageProps<"/dashboard/rfps/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: rfp },
    { data: gaps },
    { data: compliance },
    { data: disqualifiers },
    { data: questions },
    { data: sections },
    { data: assignmentRows },
    { data: roster },
    { count: libraryCount },
    { data: scoring },
  ] = await Promise.all([
      supabase.from("rfps").select("*").eq("id", id).maybeSingle(),
      supabase.from("rfp_gap_items").select("*").eq("rfp_id", id).order("created_at"),
      supabase
        .from("rfp_compliance_items")
        .select("*")
        .eq("rfp_id", id)
        .order("due_at", { ascending: true, nullsFirst: false }),
      supabase.from("rfp_disqualifier_checks").select("*").eq("rfp_id", id).order("created_at"),
      supabase.from("rfp_questions").select("*").eq("rfp_id", id).order("created_at"),
      supabase.from("rfp_proposal_sections").select("*").eq("rfp_id", id).order("sort_order"),
      // Fetched flat and stitched below rather than via PostgREST embedding:
      // the hand-written Database types carry no Relationships metadata, so an
      // embedded select resolves to `never` at compile time.
      supabase
        .from("rfp_team_assignments")
        .select("*")
        .eq("rfp_id", id)
        .order("match_score", { ascending: false, nullsFirst: false }),
      supabase.from("team_members").select("*"),
      supabase.from("language_blocks").select("*", { count: "exact", head: true }),
      supabase.from("scoring_settings").select("deadline_warning_days,deadline_critical_days").eq("id", true).maybeSingle(),
    ]);

  const windows = deadlineWindowsFrom(scoring);

  if (!rfp) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard" className="text-xs font-medium text-rfp-ink-muted hover:text-rfp-gold">
        ← Back to queue
      </Link>

      {/* Verdict card */}
      <div className="mt-3 rounded-xl border border-rfp-border bg-rfp-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-semibold text-rfp-ink">
              {rfp.title}
              {rfp.is_demo && <DemoTag />}
            </h1>
            <p className="mt-1 text-sm text-rfp-ink-secondary">
              {rfp.client_agency}
              {rfp.project_type ? ` · ${rfp.project_type}` : ""}
            </p>
          </div>
          <VerdictBadge status={rfp.status} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">Score</p>
            <p className="tabular mt-1 text-lg font-semibold text-rfp-ink">
              {rfp.score_percent !== null ? `${Math.round(rfp.score_percent)}%` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">Budget</p>
            <p className="mt-1 text-sm font-medium text-rfp-ink">{formatBudget(rfp)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">Due</p>
            <p className="mt-1 text-sm font-medium" style={{ color: deadlineColor(daysUntil(rfp.due_at), windows) }}>
              {formatDeadline(rfp.due_at)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">Question deadline</p>
            <p className="mt-1 text-sm font-medium text-rfp-ink">{formatDeadline(rfp.question_deadline_at)}</p>
          </div>
        </div>

        {(rfp.verdict_why || rfp.verdict_why_not) && (
          <div className="mt-5 grid grid-cols-1 gap-4 border-t border-rfp-border pt-5 sm:grid-cols-2">
            {rfp.verdict_why && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-rfp-good">Why</p>
                <p className="mt-1.5 whitespace-pre-line text-sm text-rfp-ink-secondary">{rfp.verdict_why}</p>
              </div>
            )}
            {rfp.verdict_why_not && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-rfp-critical">Why not</p>
                <p className="mt-1.5 whitespace-pre-line text-sm text-rfp-ink-secondary">{rfp.verdict_why_not}</p>
              </div>
            )}
          </div>
        )}

        {rfp.source_url && (
          <a
            href={rfp.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-block text-xs font-medium text-rfp-ink-muted hover:text-rfp-gold"
          >
            View original solicitation →
          </a>
        )}
      </div>

      {/* Gap list */}
      <Section title="Gap list" subtitle="What Caravann is short on for this RFP — the teaming shopping list.">
        {!gaps || gaps.length === 0 ? (
          <EmptyRow text="No gaps flagged." />
        ) : (
          <ul className="divide-y divide-rfp-border">
            {gaps.map((gap) => (
              <li key={gap.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 shrink-0 rounded-full bg-rfp-surface-sunken px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rfp-ink-muted">
                  {GAP_TYPE_LABEL[gap.gap_type] ?? gap.gap_type}
                </span>
                <p className="text-sm text-rfp-ink-secondary">{gap.description}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Compliance checklist */}
      <Section title="Compliance checklist" subtitle="Everything that can disqualify on a technicality.">
        {!compliance || compliance.length === 0 ? (
          <EmptyRow text="No compliance items extracted yet." />
        ) : (
          <ul className="divide-y divide-rfp-border">
            {compliance.map((item) => {
              const days = daysUntil(item.due_at);
              return (
                <li key={item.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${
                        item.is_complete ? "border-rfp-good bg-rfp-good" : "border-rfp-border-strong"
                      }`}
                    />
                    <div>
                      <p className="text-sm text-rfp-ink">{item.label}</p>
                      {item.detail && <p className="mt-0.5 text-xs text-rfp-ink-muted">{item.detail}</p>}
                      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-rfp-ink-muted">
                        {COMPLIANCE_CATEGORY_LABEL[item.category] ?? item.category}
                      </p>
                    </div>
                  </div>
                  {item.due_at && (
                    <span className="shrink-0 text-xs font-medium" style={{ color: deadlineColor(days, windows) }}>
                      {formatDate(item.due_at)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Disqualifier checks */}
      <Section title="Disqualifier checks" subtitle="The hard-gate pass, run against Caravann's eligibility profile.">
        {!disqualifiers || disqualifiers.length === 0 ? (
          <EmptyRow text="No disqualifier checks recorded." />
        ) : (
          <ul className="divide-y divide-rfp-border">
            {disqualifiers.map((check) => (
              <li key={check.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm text-rfp-ink">{check.requirement_text}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wide text-rfp-ink-muted">
                    {check.is_required ? "Required" : "Preferred"}
                    {check.is_hard_knockout ? " · Hard knockout" : ""}
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                  style={{
                    color:
                      check.result === "pass"
                        ? "var(--rfp-good)"
                        : check.result === "fail"
                          ? "var(--rfp-critical)"
                          : "var(--rfp-ink-muted)",
                  }}
                >
                  {check.result.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Question memo — approve / mark sent (module 7) */}
      {questions && questions.length > 0 && (
        <QuestionMemo rfpId={rfp.id} questions={questions} questionDeadline={rfp.question_deadline_at} />
      )}

      {/* Team match (module 9) */}
      <TeamMatch
        rfpId={rfp.id}
        assignments={(assignmentRows ?? []).map((a) => {
          const m = (roster ?? []).find((r) => r.id === a.team_member_id);
          return {
            id: a.id,
            status: a.status,
            match_reason: a.match_reason,
            match_score: a.match_score,
            member_name: m?.name ?? "Unknown",
            member_role: m?.role ?? null,
            member_rate: m?.rate ?? null,
          };
        })}
      />

      {/* Proposal assembly (module 8) */}
      <ProposalDraft
        rfpId={rfp.id}
        sections={sections ?? []}
        fileName={proposalFileName(rfp)}
        libraryCount={libraryCount ?? 0}
      />

      {/* Filing (module 10) */}
      <FilingStatusCard rfp={rfp} />

    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h2 className="font-display text-sm font-semibold text-rfp-ink">{title}</h2>
      <p className="mt-0.5 text-xs text-rfp-ink-muted">{subtitle}</p>
      <div className="mt-3 overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">{children}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-5 py-4 text-sm text-rfp-ink-muted">{text}</p>;
}
