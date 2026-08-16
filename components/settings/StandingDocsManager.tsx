"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * The files that go out with every submission.
 *
 * Uploaded straight to the private `client-documents` bucket from the browser,
 * the same bucket the RFP template lives in. These carry a Tax EIN and
 * signatures, so nothing about them is public and nothing is committed.
 *
 * Expiry is asked for rather than optional-by-omission, because a certificate
 * of insurance that lapsed in March is worse than not having one: it gets
 * attached with confidence and makes the submission non-responsive in a way
 * nobody checks for. Leaving it blank is still allowed, for the documents that
 * genuinely do not expire.
 */
type Doc = {
  id: string;
  label: string;
  file_name: string;
  storage_path: string;
  expires_on: string | null;
};

const BUCKET = "client-documents";

export function StandingDocsManager({ initial }: { initial: Doc[] }) {
  const [docs, setDocs] = useState<Doc[]>(initial);
  const [label, setLabel] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function upload(file: File) {
    if (!label.trim()) {
      setNote("Give it a name first, so the checklist can say what it is.");
      return;
    }
    setBusy(true);
    setNote(null);
    const supabase = createClient();
    // Namespaced and timestamped: re-uploading a renewed certificate should sit
    // beside the old one rather than silently overwrite the file a past
    // submission referenced.
    const path = `standing/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "-")}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
    if (upErr) {
      setNote(`Upload failed. ${upErr.message}`);
      setBusy(false);
      return;
    }

    const { data, error } = await supabase
      .from("standing_documents")
      .insert({
        label: label.trim(),
        file_name: file.name,
        storage_path: path,
        expires_on: expires || null,
      })
      .select("id, label, file_name, storage_path, expires_on")
      .single();

    if (error || !data) {
      // The file is already in the bucket, so leaving it there would be an
      // orphan nobody can see or remove from this screen.
      await supabase.storage.from(BUCKET).remove([path]);
      setNote(`Not saved. ${error?.message ?? "unknown error"}`);
    } else {
      setDocs([...docs, data].sort((a, b) => a.label.localeCompare(b.label)));
      setLabel("");
      setExpires("");
      setNote("Added. It will appear on every bid.");
      setTimeout(() => setNote(null), 3000);
    }
    setBusy(false);
  }

  async function remove(doc: Doc) {
    setDocs(docs.filter((d) => d.id !== doc.id));
    const supabase = createClient();
    await supabase.from("standing_documents").delete().eq("id", doc.id);
    await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-xl border border-rfp-border bg-rfp-surface p-5">
      {docs.length > 0 ? (
        <ul className="divide-y divide-rfp-border">
          {docs.map((doc) => {
            const expired = doc.expires_on !== null && doc.expires_on < today;
            return (
              <li key={doc.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 first:pt-0">
                <span className="text-sm font-medium text-rfp-ink">{doc.label}</span>
                <span className="text-xs text-rfp-ink-muted">{doc.file_name}</span>
                {doc.expires_on && (
                  <span
                    className="tabular text-xs font-medium"
                    style={{ color: expired ? "var(--rfp-critical)" : "var(--rfp-ink-muted)" }}
                  >
                    {expired ? `Expired ${doc.expires_on}` : `Valid to ${doc.expires_on}`}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void remove(doc)}
                  className="press ml-auto inline-flex min-h-11 items-center text-xs font-medium text-rfp-ink-muted hover:text-rfp-critical"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-rfp-ink-secondary">
          Nothing yet. The insurance certificate, W-9 and any signed certifications belong here.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-rfp-border pt-4">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-rfp-ink-secondary">What it is</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Certificate of insurance"
            className="min-h-11 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 text-base text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60 sm:text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-rfp-ink-secondary">Expires (optional)</span>
          <input
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            className="min-h-11 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 text-base text-rfp-ink focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60 sm:text-sm"
          />
        </label>
        <label
          className={`press inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-rfp-black px-4 text-sm font-semibold text-white hover:bg-rfp-black-2 ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          {busy ? "Uploading…" : "Choose file"}
          <input
            type="file"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {note && <p className="mt-2 text-xs font-medium text-rfp-ink-secondary">{note}</p>}
    </div>
  );
}
