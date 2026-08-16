/**
 * Strip the dashes Khaled does not want to see.
 *
 * Every one of these has been removed by hand at least once: from the
 * dashboard, from the verdict email, from a folder name added the same
 * afternoon the rule was restated. Doing it by hand does not hold, because the
 * text that carries them is written by a model on every solicitation, and a
 * prompt instruction is a request rather than a guarantee.
 *
 * So it happens on the way in, once, to everything the model wrote. The prompt
 * still asks, because asking costs nothing and produces better sentences than
 * substitution does; this is what catches the times it does not listen.
 *
 * Em and en dashes become a comma or a colon depending on what they were doing,
 * which is the repair a blanket replace got wrong the first time: turning them
 * all into hyphens left sentences reading like telegrams, and deleting them
 * ran clauses together.
 */
const EM = /—/g; // —
const EN = /–/g; // –

export function stripDashes(text: string): string;
export function stripDashes(text: string | null | undefined): string | null;
export function stripDashes(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  return (
    text
      // A dash pair around an aside becomes commas: "the score, 74%, is fine".
      .replace(/\s*—\s*([^—\n]{1,80}?)\s*—\s*/g, ", $1, ")
      // A dash introducing an explanation becomes a colon, which is what it was
      // standing in for.
      .replace(/\s*[—–]\s+(?=[a-z])/g, ": ")
      // Anything left, including a range like 2020–2024, becomes a plain hyphen.
      .replace(EM, "-")
      .replace(EN, "-")
      // A colon immediately after a colon reads as a typo.
      .replace(/::\s*/g, ": ")
      .replace(/,\s*,/g, ",")
  );
}

/** Apply to every string in an object, however deeply nested. */
export function stripDashesDeep<T>(value: T): T {
  if (typeof value === "string") return stripDashes(value) as unknown as T;
  if (Array.isArray(value)) return value.map(stripDashesDeep) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = stripDashesDeep(v);
    return out as T;
  }
  return value;
}
