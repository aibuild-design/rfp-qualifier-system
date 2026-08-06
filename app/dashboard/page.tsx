import { ChartIcon, CheckCircleIcon, ClockIcon, DocumentIcon } from "@/components/icons";
import { StatCard } from "@/components/StatCard";

// Placeholder overview — numbers below are illustrative, not wired to real
// data yet. Swap for live queries once the RFP schema/pipeline is defined.
export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-rfp-ink">Overview</h1>
        <p className="mt-1 text-sm text-rfp-ink-secondary">
          This is the dashboard shell — sections and data will fill in once the RFP qualification flow is scoped.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="RFPs received"
          value="—"
          subtext="Not connected yet"
          icon={DocumentIcon}
          accent="#0a0a0a"
        />
        <StatCard
          label="Qualified"
          value="—"
          subtext="Not connected yet"
          icon={CheckCircleIcon}
          accent="#1b8a5a"
        />
        <StatCard
          label="Pending review"
          value="—"
          subtext="Not connected yet"
          icon={ClockIcon}
          accent="#c9a227"
        />
        <StatCard
          label="Win rate"
          value="—"
          suffix="%"
          subtext="Not connected yet"
          icon={ChartIcon}
          accent="#d97a3a"
        />
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-rfp-border-strong bg-rfp-surface p-10 text-center">
        <p className="text-sm font-medium text-rfp-ink">Nothing built here yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-rfp-ink-secondary">
          The RFP list, qualification criteria, and review workflow live here once that scope is defined.
        </p>
      </div>
    </div>
  );
}
