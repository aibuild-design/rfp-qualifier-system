/**
 * Does this read as machine-written?
 *
 * The SOW asks for "humanization and an AI-detection pass on every draft". The
 * literal reading - send the text to GPTZero, get a score - answers the wrong
 * question here, because the draft is a deterministic stitch of Caravann's own
 * approved language rather than model output. A detector on human text mostly
 * measures how formal the writing is.
 *
 * What actually threatens a submission is a specific, recognisable register:
 * the vocabulary that has become a tell since everyone started drafting with a
 * model. A procurement officer reading forty proposals a month spots it, and
 * once spotted it colours everything else on the page.
 *
 * So this flags rather than rewrites. Rewriting Caravann's approved language
 * would defeat the point of having a library, and the SOW is explicit that the
 * library is the source of truth. A flag says "this phrase will read as
 * generated, here it is, decide" - which is what you want for a document a
 * person signs their name to.
 *
 * The list is the banned vocabulary from the Deep Loom proposal doctrine, which
 * is where these judgements already live.
 */

/** Words that have become tells. Matched on word boundaries, case-insensitive. */
export const TELL_WORDS = [
  "delve",
  "leverage",
  "harness",
  "utilize",
  "utilise",
  "foster",
  "bolster",
  "underscore",
  "showcase",
  "embark",
  "crucial",
  "vital",
  "paramount",
  "pivotal",
  "transformative",
  "cutting-edge",
  "robust",
  "seamless",
  "innovative",
  "tapestry",
  "realm",
  "nuanced",
  "intricate",
  "boasts",
  "elevate",
  "unlock",
  "supercharge",
  "game-changer",
  "synergy",
] as const;

/** Phrases rather than single words, so they need their own pass. */
export const TELL_PHRASES = [
  "serves as",
  "stands as",
  "best-in-class",
  "in today's",
  "it is worth noting",
  "plays a key role",
  "a testament to",
] as const;

export type VoiceFlag = { term: string; count: number };

export type VoiceReport = {
  flags: VoiceFlag[];
  /** Every flagged occurrence added up. */
  total: number;
  /** Longest sentence in words. Model prose runs long and even; a 45-word
   *  sentence is a tell on its own and is also just hard to read. */
  longestSentence: number;
};

const wordPattern = (term: string) =>
  new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");

/**
 * Reports without judging. No score, no pass/fail - a count of what was found
 * and where, so a person decides whether it matters in context. "Robust" is a
 * tell in a cover letter and the correct word in a methodology section, and no
 * threshold knows the difference.
 */
export function checkVoice(text: string | null | undefined): VoiceReport {
  const body = (text ?? "").trim();
  if (!body) return { flags: [], total: 0, longestSentence: 0 };

  const flags: VoiceFlag[] = [];
  for (const term of [...TELL_WORDS, ...TELL_PHRASES]) {
    const matches = body.match(wordPattern(term));
    if (matches?.length) flags.push({ term, count: matches.length });
  }
  flags.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));

  const longestSentence = body
    .split(/[.!?]+\s/)
    .reduce((longest, s) => Math.max(longest, s.trim().split(/\s+/).filter(Boolean).length), 0);

  return {
    flags,
    total: flags.reduce((n, f) => n + f.count, 0),
    longestSentence,
  };
}

/** One line for the UI. Deliberately plain: it is a note, not an alarm. */
export function voiceSummary(report: VoiceReport): string | null {
  if (report.total === 0 && report.longestSentence <= 40) return null;
  const parts: string[] = [];
  if (report.total > 0) {
    parts.push(
      `${report.total} phrase${report.total === 1 ? "" : "s"} that read as machine-written: ` +
        report.flags.slice(0, 4).map((f) => `"${f.term}"${f.count > 1 ? ` ×${f.count}` : ""}`).join(", ")
    );
  }
  if (report.longestSentence > 40) {
    parts.push(`longest sentence is ${report.longestSentence} words`);
  }
  return parts.join("; ");
}
