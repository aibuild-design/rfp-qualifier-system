import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ComplianceTick } from "@/components/ComplianceTick";
import { VerdictBadge } from "@/components/VerdictBadge";
import { DemoTag } from "@/components/DemoBanner";
import { ProvisionalTag } from "@/components/ProfileIncompleteBanner";
import { HumanVerdict } from "@/components/HumanVerdict";
import { BidSteps, bidSteps, ReadyToDraft } from "@/components/BidSteps";
import { AmendmentNotice } from "@/components/AmendmentNotice";
import { QuestionMemo } from "@/components/QuestionMemo";
import { TeamMatch } from "@/components/TeamMatch";
import { BuildDraftCard } from "@/components/BuildDraftCard";
import { daysUntil, deadlineColor, deadlineWindowsFrom, formatBudget, formatDate, formatDeadline } from "@/lib/rfp";
import { consensusGap } from "@/lib/verdict";
import { scoreFromRubric, type RubricBreakdown } from "@/lib/rubric";

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
  // Documents the desk cannot fill: cost schedules, signature and certification
  // pages, locked PDFs. Labelled as a job rather than a category, because a
  // missing signature page is the most common way a compliant bid is rejected.
  manual_form: "Fill in by hand",
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
    { data: scoring },
    { data: relatedDocs },
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
      supabase.from("scoring_settings").select("deadline_warning_days,deadline_critical_days,rubric_weights").eq("id", true).maybeSingle(),
      supabase
        .from("rfp_related_documents")
        .select("id, kind, sequence, title, body, received_at")
        .eq("rfp_id", id)
        .order("received_at", { ascending: false })
    ]);

  const windows = deadlineWindowsFrom(scoring);

  if (!rfp) {
    notFound();
  }

  // A decision is Khaled's human verdict, not the desk's computed one. The desk
  // never accepts anything on his behalf.
  const decided = rfp.human_verdict !== null;
  const declined = rfp.human_verdict === "no_go";
  const accepted = decided && !declined;
  const drafted = (sections ?? []).length > 0;

  const rubric = scoreFromRubric(rfp.score_breakdown as RubricBreakdown | null, scoring?.rubric_weights ?? undefined);

  // Mandatory requirements triage could not settle either way. These are the
  // reason a bid sits at maybe instead of go, and each one is answerable once
  // in the profile rather than re-litigated per solicitation.
  const unresolved = (disqualifiers ?? []).filter((c) => c.result === "unclear" && c.is_required);

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
              {!rfp.is_demo && rfp.is_provisional && <ProvisionalTag />}
            </h1>
            <p className="mt-1 text-sm text-rfp-ink-secondary">
              {rfp.client_agency}
              {rfp.project_type ? ` · ${rfp.project_type}` : ""}
            </p>
          </div>
          <VerdictBadge status={rfp.status} />
        </div>

        {rfp.status === "pending" && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-rfp-gold/30 bg-rfp-gold/5 px-4 py-3">
            <span aria-hidden className="pulse-dot mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rfp-gold" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-rfp-ink">Being read now</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-rfp-ink-secondary">
                The whole document, twice over. About a minute. <span className="font-medium text-rfp-ink">You can close this page</span> -
                it carries on without you and the verdict will be here when you come back.
              </p>
            </div>
          </div>
        )}

        {/* The caveat is real: this verdict was computed against a profile nobody
            has confirmed, and ticking the box later does not retroactively
            validate it. But it appeared on every solicitation, in three lines,
            explaining a subtlety before saying what to do about it - so it read
            as boilerplate and got skipped, which is the one outcome a warning
            cannot afford.

            One line, and the fix is the link. It disappears the moment the
            profile is confirmed, which is the point. */}
        {rfp.is_provisional && (
          <p className="mt-4 rounded-lg border border-rfp-warning/30 bg-rfp-warning/5 px-3 py-2 text-[13px] text-rfp-ink-secondary">
            Scored against an unconfirmed profile.{" "}
            <Link href="/dashboard/settings" className="font-medium text-rfp-ink underline">
              Confirm it in Settings
            </Link>
            , then re-run triage here.
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">Score</p>
            <p className="tabular mt-1 text-lg font-semibold text-rfp-ink">
              {rfp.score_percent !== null ? `${Math.round(rfp.score_percent)}%` : "-"}
            </p>
            {/* The document is read several times and the median is kept. When
                the reads agreed there is nothing to say; when they did not,
                that is the most important thing on the card. */}
            {rfp.score_samples && rfp.score_samples.length > 1 && (
              <p className="tabular mt-0.5 text-[11px] text-rfp-ink-muted">
                {consensusGap(rfp.score_samples) > 20 ? (
                  <span className="font-medium text-rfp-warning">
                    reads disagreed - {[...rfp.score_samples].sort((a, b) => a - b).join(", ")}
                  </span>
                ) : (
                  <>median of {[...rfp.score_samples].sort((a, b) => a - b).join(", ")}</>
                )}
              </p>
            )}
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
                <Reasons text={rfp.verdict_why} />
              </div>
            )}
            {rfp.verdict_why_not && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-rfp-critical">Why not</p>
                <Reasons text={rfp.verdict_why_not} />
              </div>
            )}
          </div>
        )}

        <BidSteps
          steps={bidSteps({
            scored: rfp.score_percent !== null,
            decided,
            declined,
            drafted,
            filed: rfp.filing_status === "filed",
          })}
        />

        {/* Everything this bid has a file for, in one row at the top.
            The Drive link used to live at the very bottom in the filing card,
            which is where you look to find out whether filing worked, not where
            you look to open the document. */}
        {(rfp.source_url || rfp.drive_folder_url) && (
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-rfp-border pt-4">
            {rfp.source_url && (
              <a
                href={rfp.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="press inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-rfp-gold underline decoration-rfp-gold/40 underline-offset-4 hover:decoration-rfp-gold"
              >
                The original document &rarr;
              </a>
            )}
            {rfp.drive_folder_url && (
              <a
                href={rfp.drive_folder_url}
                target="_blank"
                rel="noopener noreferrer"
                className="press inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-rfp-gold underline decoration-rfp-gold/40 underline-offset-4 hover:decoration-rfp-gold"
              >
                The bid folder in Drive &rarr;
              </a>
            )}

          </div>
        )}
      </div>

      {/* Above the reasoning, because it can invalidate it. */}
      <AmendmentNotice
        rfpId={rfp.id}
        unreviewed={rfp.has_unreviewed_amendment}
        documents={relatedDocs ?? []}
      />

      {/* Band one: the reasoning behind the verdict. */}
      <div className="mt-10 flex items-baseline gap-3 border-b border-rfp-border-strong pb-2">
        <h2 className="font-display text-base font-semibold text-rfp-ink">Why the desk said this</h2>
      </div>

      {rubric && (
        <Section
          title="How the score was reached"
                  >
          <ul className="divide-y divide-rfp-border">
            {rubric.dimensions.map((d) => (
              <li key={d.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3">
                <span className="min-w-[9rem] text-sm font-medium text-rfp-ink">{d.label}</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                  style={{
                    background: d.points === 0 ? "var(--rfp-surface-sunken)" : "color-mix(in srgb, var(--rfp-good) 12%, transparent)",
                    color: d.points === 0 ? "var(--rfp-ink-muted)" : "var(--rfp-good)",
                  }}
                >
                  {d.level.replace(/_/g, " ")}
                </span>
                <span className="tabular text-xs font-semibold text-rfp-ink-secondary">
                  {d.points}/{d.maxPoints}
                </span>
                {d.note && <span className="w-full text-xs leading-relaxed text-rfp-ink-muted">{d.note}</span>}
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 bg-rfp-surface-sunken/60 px-5 py-3">
              <span className="text-sm font-semibold text-rfp-ink">Total</span>
              <span className="tabular text-sm font-semibold text-rfp-ink">{rubric.score}%</span>
            </li>
          </ul>
          {rubric.missing.length > 0 && (
            <p className="border-t border-rfp-border px-5 py-2.5 text-xs text-rfp-ink-muted">
              {rubric.missing.length} dimension{rubric.missing.length > 1 ? "s" : ""} went unjudged
              ({rubric.missing.join(", ")}); the score is scaled over the rest rather than counting them as zero.
            </p>
          )}
        </Section>
      )}

      {/* Gap list */}
      <Section
        title="Gap list"
        subtitle="What a teaming partner would need to bring."
        open={false}
        count={`${(gaps ?? []).length}`}
      >
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
      <Section
        title="Compliance checklist"
        count={`${(compliance ?? []).filter((c) => !c.is_complete).length} open`}
      >
        {!compliance || compliance.length === 0 ? (
          <EmptyRow text="No compliance items extracted yet." />
        ) : (
          <ul className="divide-y divide-rfp-border">
            {compliance.map((item) => {
              const days = daysUntil(item.due_at);
              return (
                <li key={item.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="flex items-start gap-3">
                    <ComplianceTick
                      rfpId={rfp.id}
                      itemId={item.id}
                      label={item.label}
                      complete={item.is_complete}
                    />
                    <div>
                      <p className="text-sm text-rfp-ink">{item.label}</p>
                      {item.detail && <p className="mt-0.5 text-xs text-rfp-ink-muted">{item.detail}</p>}
                      {/* The category is only worth printing when it says
                          something the label does not. "20-page limit" followed
                          by "Page limit" is the same fact twice, and a checklist
                          that repeats itself teaches people to skim it. */}
                      {(() => {
                        const cat = COMPLIANCE_CATEGORY_LABEL[item.category] ?? item.category;
                        const words = cat.toLowerCase().split(" ").filter((w) => w.length > 3);
                        const label = item.label.toLowerCase();
                        const echoes = words.length > 0 && words.every((w) => label.includes(w));
                        return echoes ? null : (
                          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-rfp-ink-muted">
                            {cat}
                          </p>
                        );
                      })()}
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
      <Section
        title="Disqualifier checks"
        open={(disqualifiers ?? []).some((d) => d.result !== "pass")}
        count={`${(disqualifiers ?? []).filter((d) => d.result === "pass").length} of ${(disqualifiers ?? []).length} pass`}
      >
        {!disqualifiers || disqualifiers.length === 0 ? (
          <EmptyRow text="No disqualifier checks recorded." />
        ) : (
          <>
            {/* Unanswered mandatory requirements are the only thing on this card
                that a person can act on, so they get said once, plainly, at the
                top - rather than left for the reader to spot among the passes. */}
            {unresolved.length > 0 && (
              <div className="mx-5 mt-4 rounded-lg border border-rfp-warning/40 bg-rfp-warning/5 px-4 py-3">
                <p className="text-sm font-semibold text-rfp-ink">
                  {unresolved.length} mandatory requirement{unresolved.length > 1 ? "s" : ""} the profile does not answer
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-rfp-ink-muted">
                  Not a failure - triage could not tell either way, so this is held at{" "}
                  <span className="font-medium text-rfp-ink">maybe</span> rather than closed. Record the answer in{" "}
                  <Link href="/dashboard/settings" className="underline underline-offset-2 hover:text-rfp-ink">
                    the eligibility profile
                  </Link>{" "}
                  and future solicitations decide themselves.
                </p>
              </div>
            )}
            <ul className="divide-y divide-rfp-border">
              {disqualifiers.map((check) => (
                <li key={check.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm text-rfp-ink">{check.requirement_text}</p>
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-rfp-ink-muted">
                      {check.is_required ? "Required" : "Preferred"}
                      {check.is_hard_knockout ? " · Hard knockout" : ""}
                    </p>
                    {check.result === "unclear" && check.notes && (
                      <p className="mt-1 text-[13px] leading-relaxed text-rfp-ink-muted">{check.notes}</p>
                    )}
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                    style={{
                      color:
                        check.result === "pass"
                          ? "var(--rfp-good)"
                          : check.result === "fail"
                            ? "var(--rfp-critical)"
                            : check.result === "unclear"
                              ? "var(--rfp-warning)"
                              : "var(--rfp-ink-muted)",
                    }}
                  >
                    {check.result === "unclear" ? "unconfirmed" : check.result.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {/* Band two: the work only a person can do. */}
      <div className="mt-10 flex items-baseline gap-3 border-b border-rfp-border-strong pb-2">
        <h2 className="font-display text-base font-semibold text-rfp-ink">What needs you</h2>
      </div>

      {/* Question memo - approve / mark sent (module 7) */}
      {questions && questions.length > 0 && (
        <QuestionMemo rfpId={rfp.id} questions={questions} questionDeadline={rfp.question_deadline_at} />
      )}

      {/* Team match (module 9) */}
      <TeamMatch
        rfpId={rfp.id}
        roster={(roster ?? []).filter((m) => m.active).map((m) => ({ id: m.id, name: m.name }))}
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

      {/* Nothing below this point exists until Khaled has accepted the bid.
          Drafting a proposal for a decision that has not been made puts the
          last step of the process at the top of the page, and puts work under
          bids that are about to be declined. */}
      {!accepted ? (
        <section className="mt-8 rounded-xl border border-dashed border-rfp-border-strong bg-rfp-surface px-5 py-4">
          <h2 className="font-display text-sm font-semibold text-rfp-ink">
            {declined ? "No proposal needed" : "The proposal comes next"}
          </h2>
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-rfp-ink-secondary">
            {declined
              ? "You declined this bid, so nothing is drafted and nothing is filed beyond the solicitation itself."
              : "Accept this bid above and a Draft button appears here. Fourteen sections are built from Caravann's approved language, filed to the bid folder, and nothing is written before you decide."}
          </p>
        </section>
      ) : (
        <>

      {/* Band three: everything that follows accepting the bid. */}
      <div className="mt-10 flex items-baseline gap-3 border-b border-rfp-border-strong pb-2">
        <h2 className="font-display text-base font-semibold text-rfp-ink">The proposal</h2>
      </div>

      {/* What is still open. Placed above the draft because it is the last
          thing worth glancing at before pressing the button, and below the
          panels it counts so the numbers are already in view. */}
      <ReadyToDraft
        openQuestions={(questions ?? []).filter((q) => q.status === "drafted").length}
        unconfirmedTeam={
          (assignmentRows ?? []).filter((a) => a.status !== "confirmed").length
        }
        openCompliance={(compliance ?? []).filter((c) => !c.is_complete).length}
      />

      {/* The writing half lives at /dashboard/proposals now. What is left here
          is the one card that gets you there, because a bid page should end
          with the decision, not with a fourteen-section document. */}
      <BuildDraftCard rfpId={rfp.id} drafted={(sections ?? []).length} />
        </>
      )}

      {/* The decision, last. It used to sit in the header behind a link reading
          "Do you agree with this verdict?", which put the one thing only a
          person can do above everything that informs it, and hid it behind a
          click. The page now reads top down: what the desk found, then what you
          decide. */}
      <section className="mt-10 border-t-2 border-rfp-border-strong pt-6">
        <HumanVerdict
          rfpId={rfp.id}
          computed={rfp.status}
          current={rfp.human_verdict}
          currentNote={rfp.human_verdict_note}
          decidedAt={rfp.human_verdict_at}
        />

      </section>

    </div>
  );
}

/**
 * A section of the bid, open or folded away.
 *
 * The rule is: **open if it needs you, folded if it is evidence.** Cutting
 * words got this page five percent shorter and no easier to read, because the
 * length was never padding. It was fourteen hundred words of real findings,
 * every one of them expanded at once, on a page whose actual purpose is a
 * decision at the bottom.
 *
 * Folded sections still say how much is inside, so nothing is hidden, only
 * stacked. A count on a closed row is more informative than eleven rows you
 * scroll past.
 *
 * An empty subtitle renders nothing rather than a blank line, so a section
 * whose heading already says everything does not pay for an empty row.
 */
function Section({
  title,
  subtitle,
  count,
  open = true,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Shown on the fold, so a closed section still reports its size. */
  count?: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="mt-6 group">
      <summary className="press flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-sm font-semibold text-rfp-ink">{title}</h2>
        {count ? (
          <span className="rounded-full bg-rfp-surface-sunken px-2 py-0.5 text-[11px] font-medium tabular-nums text-rfp-ink-secondary">
            {count}
          </span>
        ) : null}
        {subtitle ? <p className="text-xs text-rfp-ink-muted">{subtitle}</p> : null}
        <span className="ml-auto text-xs text-rfp-ink-muted group-open:hidden">show</span>
        <span className="ml-auto hidden text-xs text-rfp-ink-muted group-open:inline">hide</span>
      </summary>
      <div className="mt-2.5 overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">{children}</div>
    </details>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-5 py-4 text-sm text-rfp-ink-muted">{text}</p>;
}

/**
 * The verdict's reasons, one per line.
 *
 * These arrive as a paragraph, and a paragraph is the wrong shape for them:
 * every one is a list of independent findings - depth here, references there,
 * insurance unrecorded - and running them together makes the reader do the
 * separating. Four reasons in prose read as one opinion; four bullets read as
 * four things to check.
 *
 * Splits on newlines first, because the model is now asked for one reason per
 * line. Falls back to sentence boundaries so the paragraphs already stored
 * still break up, and to the whole string if neither applies, which is why a
 * single unbroken reason still renders rather than vanishing.
 */
function Reasons({ text }: { text: string }) {
  const lines = text
    .split(/\n+/)
    .flatMap((line) => (line.includes("\n") ? [line] : line.split(/(?<=\.)\s+(?=[A-Z])/)))
    .map((line) => line.replace(/^[-*\u2022]\s*/, "").trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return <p className="mt-1.5 text-sm leading-relaxed text-rfp-ink-secondary">{text}</p>;
  }

  // Two, then the rest on request. This is the tallest thing above the fold and
  // the first reason is almost always the one that decided it; the others are
  // worth having and not worth three inches of the page every time.
  const shown = lines.slice(0, 2);
  const rest = lines.slice(2);

  return (
    <>
      <ul className="mt-1.5 space-y-1.5">
        {shown.map((line, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-rfp-ink-secondary">
            <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-rfp-ink-muted" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="mt-1.5 group">
          <summary className="press cursor-pointer text-xs font-medium text-rfp-ink-muted hover:text-rfp-ink">
            <span className="group-open:hidden">{rest.length} more</span>
            <span className="hidden group-open:inline">Fewer</span>
          </summary>
          <ul className="mt-1.5 space-y-1.5">
            {rest.map((line, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-rfp-ink-secondary">
                <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-rfp-ink-muted" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
