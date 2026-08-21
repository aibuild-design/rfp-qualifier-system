import Link from "next/link";

/**
 * Which page of the queue you are on.
 *
 * Absent entirely at one page, which is where this desk lives most of the time.
 * A pager that always shows, reading "1 of 1", is furniture that teaches people
 * to stop looking at it, and then it is not noticed on the day there are three.
 *
 * Every link carries the current view, section and sort, because a pager that
 * silently resets the filter you are looking through is worse than no pager.
 */
export function QueuePager({
  page,
  pageCount,
  total,
  params,
}: {
  page: number;
  pageCount: number;
  total: number;
  params: { view?: string | null; folder?: string | null; sort?: string | null };
}) {
  if (pageCount <= 1) return null;

  const href = (n: number) => {
    const q = new URLSearchParams();
    if (params.view) q.set("view", params.view);
    if (params.folder) q.set("folder", params.folder);
    if (params.sort) q.set("sort", params.sort);
    if (n > 1) q.set("page", String(n));
    const s = q.toString();
    return `/dashboard${s ? `?${s}` : ""}`;
  };

  const numbers = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <nav
      aria-label="Queue pages"
      className="mt-4 flex flex-wrap items-center gap-2 text-sm text-rfp-ink-secondary"
    >
      <span className="tabular mr-1">
        {total} solicitation{total === 1 ? "" : "s"}
      </span>

      {page > 1 && (
        <Link
          href={href(page - 1)}
          className="press inline-flex min-h-11 items-center rounded-lg border border-rfp-border px-3 font-medium hover:bg-rfp-surface-sunken"
        >
          Previous
        </Link>
      )}

      {numbers.map((n) => (
        <Link
          key={n}
          href={href(n)}
          aria-current={n === page ? "page" : undefined}
          className={`press tabular inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 font-medium ${
            n === page
              ? "border-rfp-ink bg-rfp-ink text-rfp-surface"
              : "border-rfp-border hover:bg-rfp-surface-sunken"
          }`}
        >
          {n}
        </Link>
      ))}

      {page < pageCount && (
        <Link
          href={href(page + 1)}
          className="press inline-flex min-h-11 items-center rounded-lg border border-rfp-border px-3 font-medium hover:bg-rfp-surface-sunken"
        >
          Next
        </Link>
      )}
    </nav>
  );
}
