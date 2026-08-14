"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitSolicitation } from "@/app/dashboard/new/actions";

export function NewSolicitationForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"link" | "text" | "upload">("link");
  // A solicitation usually arrives as a file. Reading it here rather than
  // making someone open it, select all and paste means the text the desk
  // triages is the document itself, headers and footers included.
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; warning?: string } | null>(null);

  const [form, setForm] = useState({ title: "", client_agency: "", document_url: "", document_text: "" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await submitSolicitation({
        title: form.title,
        client_agency: form.client_agency,
        ...(mode === "link" ? { document_url: form.document_url } : { document_text: form.document_text }),
      });
      if (r.error) return setError(r.error);
      setDone({ id: r.id!, warning: r.warning });
    });
  }

  if (done) {
    return (
      <div className="rounded-xl border border-rfp-border bg-rfp-surface p-6">
        <p className="text-sm font-semibold text-rfp-ink">In the queue</p>
        <p className="mt-1.5 text-sm leading-relaxed text-rfp-ink-secondary">
          {done.warning ??
            "It is being read now - the whole document, three times over. About a minute, and you can close this: it runs on the server and carries on without you."}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => router.push(`/dashboard/rfps/${done.id}`)}
            className="rounded-lg bg-rfp-black px-3.5 py-2 text-sm font-semibold text-white hover:bg-rfp-black-2"
          >
            Open it
          </button>
          <button
            onClick={() => {
              setDone(null);
              setForm({ title: "", client_agency: "", document_url: "", document_text: "" });
              setFileName(null);
            }}
            className="rounded-lg border border-rfp-border px-3.5 py-2 text-sm font-semibold text-rfp-ink-secondary hover:bg-rfp-surface-sunken"
          >
            Add another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-rfp-border bg-rfp-surface p-6">
      <Field label="Solicitation title" hint="As the agency names it - this becomes the file name.">
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
          placeholder="Facilitation and Strategic Planning Services"
          className={inputClass}
        />
      </Field>

      <Field label="Agency" hint="The issuing body.">
        <input
          value={form.client_agency}
          onChange={(e) => setForm({ ...form, client_agency: e.target.value })}
          required
          placeholder="San Mateo County Transit District"
          className={inputClass}
        />
      </Field>

      <div className="flex gap-2 border-b border-rfp-border pb-3">
        {(["link", "upload", "text"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium press ${
              mode === m ? "bg-rfp-black text-white" : "text-rfp-ink-secondary hover:bg-rfp-surface-sunken"
            }`}
          >
            {m === "link" ? "Link to the document" : m === "upload" ? "Upload a file" : "Paste the text"}
          </button>
        ))}
      </div>

      {mode === "link" ? (
        <Field
          label="Document link"
          hint="A direct link to the PDF works best. A portal page behind a login can't be fetched - paste the text instead."
        >
          <input
            type="url"
            value={form.document_url}
            onChange={(e) => setForm({ ...form, document_url: e.target.value })}
            placeholder="https://agency.gov/rfp/2026-04.pdf"
            className={inputClass}
          />
        </Field>
      ) : mode === "upload" ? (
        <Field
          label="Upload the solicitation"
          hint="PDF, Word or plain text. The file is read here and its text is what gets triaged - the file itself is not stored."
        >
          <input
            type="file"
            accept=".pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setError(null);
              setReading(true);
              setFileName(file.name);
              try {
                // Straight to the same endpoint n8n uses for email attachments,
                // so an uploaded document and an emailed one are read by exactly
                // the same code rather than by two implementations that drift.
                const res = await fetch("/api/rfps/extract", {
                  method: "POST",
                  headers: { "content-type": file.type || "application/octet-stream" },
                  body: file,
                });
                const out = await res.json();
                if (!res.ok) throw new Error(out.error ?? "Could not read that file");
                if (!out.text?.trim()) throw new Error("That file produced no readable text - a scanned PDF has no text layer.");
                setForm((f) => ({ ...f, document_text: out.text, document_url: "" }));
              } catch (err) {
                setFileName(null);
                setError(err instanceof Error ? err.message : "Could not read that file");
              } finally {
                setReading(false);
              }
            }}
            className="block w-full text-sm text-rfp-ink-secondary file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border-0 file:bg-rfp-black file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-rfp-black-2"
          />
          {reading && <p className="mt-2 text-xs text-rfp-ink-muted">Reading {fileName}…</p>}
          {!reading && fileName && form.document_text && (
            <p className="mt-2 text-xs text-rfp-good">
              Read {fileName} — {form.document_text.length.toLocaleString()} characters. Submit to triage it.
            </p>
          )}
        </Field>
      ) : (
        <Field label="Solicitation text" hint="The whole document. It is read in one pass, so more is better than less.">
          <textarea
            value={form.document_text}
            onChange={(e) => setForm({ ...form, document_text: e.target.value })}
            rows={12}
            placeholder="Paste the full solicitation…"
            className={inputClass}
          />
        </Field>
      )}

      {error && <p className="text-sm font-medium text-rfp-critical">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-rfp-black py-2.5 text-sm font-semibold text-white press hover:bg-rfp-black-2 disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit for triage"}
      </button>

      <p className="text-center text-[11px] text-rfp-ink-muted">
        Scored against the eligibility profile in Settings. If that is still placeholder data, treat
        the verdict as a demonstration.
      </p>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2.5 text-base sm:text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60";

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-rfp-ink-secondary">{label}</label>
      {children}
      <p className="text-xs text-rfp-ink-muted">{hint}</p>
    </div>
  );
}
