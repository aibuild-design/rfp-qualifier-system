/**
 * What you see while a page is on its way.
 *
 * Every dashboard navigation costs a round trip to Supabase to verify the
 * session before the page's own queries even start, so there is always a
 * moment between the click and the content. There was nothing on screen for
 * that moment: no spinner, no skeleton, no change of any kind, which reads as
 * a dead click rather than a load.
 *
 * It was also costing more than it looked. Next only prefetches a dynamic
 * route as far as its nearest loading boundary, and there wasn't one anywhere
 * in the app, so hovering a link prefetched nothing and every navigation paid
 * the full server wait. This file is the boundary, which is why adding it
 * makes the app quicker as well as feel quicker.
 *
 * Deliberately generic. It covers every page in the segment that has no
 * skeleton of its own, and all of them open the same way: a title, a line of
 * explanation, then a block of content. Matching that shape is enough to keep
 * the layout from jumping when the real thing arrives; matching each page
 * exactly would be a second copy of every page to maintain.
 *
 * The shimmer already existed in globals.css, including its reduced-motion
 * rule, and had never been used by anything.
 */
export default function DashboardLoading() {
  return (
    <div className="fade-in" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <div className="h-7 w-56 rounded-lg shimmer" />
      <div className="mt-3 h-4 w-96 max-w-full rounded shimmer" />

      <div className="mt-6 flex flex-wrap gap-2">
        {[88, 112, 168, 96].map((w, i) => (
          <div key={i} className="h-11 rounded-lg shimmer" style={{ width: w }} />
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-rfp-border bg-rfp-surface p-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className={i ? "mt-5 border-t border-rfp-border pt-5" : ""}>
            <div className="h-4 w-2/3 rounded shimmer" />
            <div className="mt-2.5 h-3 w-1/2 rounded shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
