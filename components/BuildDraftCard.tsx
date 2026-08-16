"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { buildDraft } from "@/app/dashboard/rfps/[id]/actions";

/**
 * The bid page's one link into the writing half.
 *
 * The whole fourteen-section list used to render here, under the reasoning,
 * which put a document worked on for days below an argument read once. Now the
 * bid page carries a single card: build it, or go to it.
 *
 * Building navigates to the proposal rather than quietly filling in a panel
 * further down a long page. A button whose only visible effect is somewhere
 * below the fold is a button people press twice.
 */
export function BuildDraftCard({ rfpId, drafted }: { rfpId: string; drafted: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function build() {
    start(async () => {
      await buildDraft(rfpId);
      router.push(`/dashboard/proposals/${rfpId}`);
    });
  }

  return (
    <section className="mt-8 rounded-xl border border-rfp-border bg-rfp-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-sm font-semibold text-rfp-ink">Proposal</h2>
        <p className="text-xs text-rfp-ink-muted">
          {drafted ? `${drafted} sections built` : "Nothing written yet"}
        </p>
      </div>

      {drafted > 0 ? (
        <a
          href={`/dashboard/proposals/${rfpId}`}
          className="press mt-4 flex min-h-14 w-full items-center justify-center rounded-xl bg-rfp-ink text-base font-semibold text-rfp-surface hover:opacity-90"
        >
          Open the proposal
        </a>
      ) : (
        <>
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-rfp-ink-secondary">
            Fourteen sections assembled from Caravann&rsquo;s approved language into the real
            template. Nothing is sent anywhere.
          </p>
          <button
            onClick={build}
            disabled={pending}
            className="press mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-rfp-ink text-base font-semibold text-rfp-surface hover:opacity-90 disabled:opacity-70"
          >
            {pending ? (
              <>
                {/* Building takes a moment and then navigates. Without this the
                    page sits still long enough to look broken. */}
                <span
                  aria-hidden
                  className="h-4 w-4 animate-spin rounded-full border-2 border-rfp-surface/30 border-t-rfp-surface"
                />
                Building the draft…
              </>
            ) : (
              "Build the draft"
            )}
          </button>
        </>
      )}
    </section>
  );
}
