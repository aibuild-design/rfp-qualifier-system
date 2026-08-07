import { createClient } from "@/lib/supabase/server";
import { LanguageLibrary } from "@/components/LanguageLibrary";

// Module 8's foundation. The SOW puts this library in Caravann's own Drive;
// holding it here instead is a deliberate simplification for the skeletal
// build — the shape (blocks per section, winners weighted above boilerplate)
// is the part that matters and transfers either way.
export default async function LibraryPage() {
  const supabase = await createClient();
  const { data: blocks } = await supabase
    .from("language_blocks")
    .select("*")
    .order("won", { ascending: false })
    .order("title");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-2">
        <h1 className="font-display text-2xl font-semibold text-rfp-ink">Approved language</h1>
        <p className="mt-1 text-sm text-rfp-ink-secondary">
          What proposal drafts are built from. Text Caravann has already used and stands behind —
          which is what stops a draft reading like it came from a language model.
        </p>
      </div>
      <p className="mb-6 text-xs leading-relaxed text-rfp-ink-muted">
        Blocks from winning proposals are ranked above everything else, and locked boilerplate is
        copied verbatim rather than reworded. A section with nothing on file is reported as needing
        writing by hand instead of being filled with invented text.
      </p>

      <LanguageLibrary blocks={blocks ?? []} />
    </div>
  );
}
