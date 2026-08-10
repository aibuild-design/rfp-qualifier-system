import Image from "next/image";

export function SupabaseNotConfigured() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-rfp-page px-4">
      <div className="w-full max-w-md rounded-xl border border-rfp-border bg-rfp-surface p-8 text-center shadow-sm">
        <Image
          src="/brand/caravann-black.png"
          alt="Caravann"
          width={1494}
          height={205}
          className="mx-auto h-[22px] w-auto object-contain"
        />
        <h1 className="mt-4 font-display text-lg font-semibold text-rfp-ink">
          RFP Qualifier isn&rsquo;t connected yet
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-rfp-ink-secondary">
          This is the skeletal build - the dashboard shell and auth pages are
          wired, but no Supabase project is attached. Copy{" "}
          <code className="rounded bg-rfp-surface-sunken px-1.5 py-0.5 text-xs">
            .env.example
          </code>{" "}
          to{" "}
          <code className="rounded bg-rfp-surface-sunken px-1.5 py-0.5 text-xs">
            .env.local
          </code>
          , fill in the Supabase URL + anon key, then run the migration in{" "}
          <code className="rounded bg-rfp-surface-sunken px-1.5 py-0.5 text-xs">
            supabase/migrations/
          </code>
          .
        </p>
        <p className="mt-4 text-xs text-rfp-ink-muted">Restart the dev server after adding env vars.</p>
      </div>
    </div>
  );
}
