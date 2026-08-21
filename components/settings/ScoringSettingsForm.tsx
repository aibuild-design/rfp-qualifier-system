"use client";

import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSavedForm } from "@/components/settings/useSavedForm";
import { SaveBar } from "@/components/settings/SaveBar";
import { NumberField, Toggle } from "@/components/ui/form";
import type { ScoringSettingsRow } from "@/lib/supabase/types";

/**
 * Where the go / no-go line sits.
 *
 * This used to be the model's call and it was not reproducible - one
 * solicitation returned maybe/83, go/87 and go/88 across three runs. The label
 * is now arithmetic, and this is where the arithmetic's inputs live, because
 * how much overlap is "enough" is a judgement about Caravann's appetite for
 * risk rather than something to argue with a model about.
 *
 * The band preview matters more than it looks: a threshold is an abstract
 * number until you can see which of your live solicitations moves across it.
 */
export function ScoringSettingsForm({
  initial,
  scoreSample,
}: {
  initial: ScoringSettingsRow;
  /** Scores of the RFPs currently in the queue, so the effect of a change is
   *  visible against real work rather than imagined. */
  scoreSample: number[];
}) {
  // Thresholds decide every verdict, so they are written when somebody presses
  // Save and not when focus happens to leave a number field.
  const { value: settings, setValue: setSettings, dirty, saving, error, justSaved, commit, discard } =
    useSavedForm<ScoringSettingsRow>(initial, async (next) => {
      const { error: failure } = await createClient()
        .from("scoring_settings")
        .update({
          go_threshold: next.go_threshold,
          maybe_threshold: next.maybe_threshold,
          deadline_warning_days: next.deadline_warning_days,
          deadline_critical_days: next.deadline_critical_days,
          preferred_misses_are_fatal: next.preferred_misses_are_fatal,
        })
        .eq("id", true);
      return failure ? { message: failure.message } : null;
    });

  // Mirrors the database's own constraint. Checking here too means the person
  // gets told why, next to the field, instead of a Postgres error.
  const thresholdError =
    settings.maybe_threshold > settings.go_threshold
      ? "The maybe floor cannot sit above the go bar - nothing could ever be a go."
      : null;
  const deadlineError =
    settings.deadline_critical_days > settings.deadline_warning_days
      ? "The red window has to be shorter than the yellow one."
      : null;


  const counts = useMemo(() => {
    const go = scoreSample.filter((s) => s >= settings.go_threshold).length;
    const maybe = scoreSample.filter((s) => s >= settings.maybe_threshold && s < settings.go_threshold).length;
    return { go, maybe, noGo: scoreSample.length - go - maybe };
  }, [scoreSample, settings.go_threshold, settings.maybe_threshold]);

  const num = (v: string, fallback: number) => {
    const parsed = Number.parseInt(v, 10);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : fallback;
  };

  return (
    <div className="rounded-xl border border-rfp-border bg-rfp-surface p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          id="go-threshold"
          label="Go at or above"
          suffix="%"
          min={0}
          max={100}
          value={settings.go_threshold}
          error={thresholdError}
          hint="Scores at or above this are worth bidding."
          onChange={(e) => setSettings({ ...settings, go_threshold: num(e.target.value, settings.go_threshold) })}
          
        />
        <NumberField
          id="maybe-threshold"
          label="Maybe at or above"
          suffix="%"
          min={0}
          max={100}
          value={settings.maybe_threshold}
          hint="Below this, it is ruled out on overlap alone."
          onChange={(e) => setSettings({ ...settings, maybe_threshold: num(e.target.value, settings.maybe_threshold) })}
          
        />
      </div>

      {/* The bands, drawn. Reading "85" tells you less than seeing where it cuts. */}
      <div className="mt-5">
        <div className="flex h-2.5 overflow-hidden rounded-full" role="img" aria-label={bandLabel(settings)}>
          <div style={{ width: `${settings.maybe_threshold}%` }} className="bg-rfp-critical/70" />
          <div
            style={{ width: `${Math.max(0, settings.go_threshold - settings.maybe_threshold)}%` }}
            className="bg-rfp-warning/70"
          />
          <div style={{ width: `${Math.max(0, 100 - settings.go_threshold)}%` }} className="bg-rfp-good/70" />
        </div>
        <div className="tabular mt-2 flex justify-between text-[11px] font-medium text-rfp-ink-muted">
          <span>No-go · 0–{Math.max(0, settings.maybe_threshold - 1)}%</span>
          <span>Maybe · {settings.maybe_threshold}–{Math.max(0, settings.go_threshold - 1)}%</span>
          <span>Go · {settings.go_threshold}–100%</span>
        </div>

        {scoreSample.length > 0 && (
          <p className="mt-3 rounded-lg bg-rfp-surface-sunken px-3 py-2 text-xs leading-relaxed text-rfp-ink-secondary">
            Against the {scoreSample.length} scored solicitation{scoreSample.length > 1 ? "s" : ""} in the queue right
            now, these settings give{" "}
            <strong className="tabular font-semibold text-rfp-good">{counts.go} go</strong>,{" "}
            <strong className="tabular font-semibold text-rfp-warning">{counts.maybe} maybe</strong>, and{" "}
            <strong className="tabular font-semibold text-rfp-critical">{counts.noGo} no-go</strong>. Changing them does
            not re-score past RFPs - it applies from the next one.
          </p>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          id="deadline-warning"
          label="Deadline turns yellow"
          suffix="days"
          min={1}
          max={90}
          value={settings.deadline_warning_days}
          hint="How much runway counts as getting close."
          onChange={(e) =>
            setSettings({ ...settings, deadline_warning_days: num(e.target.value, settings.deadline_warning_days) })
          }
          
        />
        <NumberField
          id="deadline-critical"
          label="Deadline turns red"
          suffix="days"
          min={1}
          max={90}
          value={settings.deadline_critical_days}
          error={deadlineError}
          hint="The point where it is nearly too late to start."
          onChange={(e) =>
            setSettings({ ...settings, deadline_critical_days: num(e.target.value, settings.deadline_critical_days) })
          }
          
        />
      </div>

      <div className="mt-5">
        <Toggle
          id="preferred-fatal"
          tone="caution"
          label="Treat missed “preferred” requirements as dealbreakers"
          description="Off by default, and worth leaving off. Agencies write “preferred” for things they would like, not things they require - a firm that bids anyway still wins these. Turning this on will rule out work Caravann could take."
          checked={settings.preferred_misses_are_fatal}
          onChange={(next) => setSettings({ ...settings, preferred_misses_are_fatal: next })}
        />
      </div>

      {/* Only a genuine save failure belongs here. Validation problems are
          already stated next to the field that caused them, and repeating
          them at the bottom reads as two separate faults.

          Save is refused while a threshold pair is contradictory, because a
          maybe floor above the go bar means nothing can ever be a go and the
          database rejects it anyway. */}
      <SaveBar
        dirty={dirty}
        saving={saving}
        error={error ?? thresholdError ?? deadlineError}
        justSaved={justSaved}
        onSave={() => {
          if (thresholdError || deadlineError) return;
          void commit();
        }}
        onDiscard={discard}
      />
    </div>
  );
}

function bandLabel(s: ScoringSettingsRow): string {
  return `No-go below ${s.maybe_threshold} percent, maybe from ${s.maybe_threshold} to ${s.go_threshold - 1} percent, go at ${s.go_threshold} percent and above.`;
}
