import { NewSolicitationForm } from "@/components/NewSolicitationForm";

export default function NewSolicitationPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-rfp-ink">Add a solicitation</h1>
        <p className="mt-1 text-sm text-rfp-ink-secondary">
          Paste a link to the document, or the text itself. It lands in the queue straight away and
          the verdict follows in about a minute.
        </p>
      </div>
      <NewSolicitationForm />
    </div>
  );
}
