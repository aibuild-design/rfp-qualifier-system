"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OrgProfileRow } from "@/lib/supabase/types";

/**
 * The sign-off on everything in the facts section.
 *
 * It lives here rather than at the bottom of the eligibility form because it
 * covers the sector map and the roster too — ticking it says "all of this is
 * real", and putting it inside one of the three forms made it look like it only
 * applied to that one.
 *
 * The checklist above the tick is the point. Left to itself, "confirm your
 * profile" is a task with no visible end; a list that empties as you go is one
 * you can finish. Each line is checked against the data rather than tracked
 * separately, so it cannot drift out of step with what is actually stored.
 */
export function ProfileConfirmation({
  initial,
  sectorsMissingCounts,
  teamCount,
}: {
  initial: OrgProfileRow;
  /** Sectors with no years or no engagement count recorded. */
  sectorsMissingCounts: string[];
  teamCount: number;
}) {
  const [profile, setProfile] = useState(initial);
  const [saving, setSaving] = useState(false);

  const gaps = [
    { label: "Office locations", done: profile.office_locations.length > 0 },
    { label: "Consultant locations", done: profile.consultant_locations.length > 0 },
    {
      label: "Certifications and set-aside status",
      done: profile.certifications.length > 0 || profile.set_aside_status.length > 0,
      note: "Leave empty if Caravann genuinely holds none — claiming one it does not can void a bid.",
      optional: true,
    },
    { label: "Insurance carried", done: Boolean(profile.insurance_coverage?.trim()) },
    { label: "Facilitating elected or appointed bodies", done: Boolean(profile.governing_body_experience?.trim()) },
    {
      label:
        sectorsMissingCounts.length > 0
          ? `Sector years and engagement counts (${sectorsMissingCounts.length} incomplete)`
          : "Sector years and engagement counts",
      done: sectorsMissingCounts.length === 0,
      note: sectorsMissingCounts.length > 0 ? sectorsMissingCounts.join(", ") : undefined,
    },
    { label: "Team roster", done: teamCount > 0 },
  ];

  const outstanding = gaps.filter((g) => !g.done && !g.optional);

  async function toggle() {
    const next = { ...profile, profile_confirmed: !profile.profile_confirmed };
    setProfile(next);
    setSaving(true);
    await createClient().from("org_profile").update({ profile_confirmed: next.profile_confirmed }).eq("id", true);
    setSaving(false);
  }

  return (
    <div className="rounded-xl border border-rfp-border bg-rfp-surface p-5">
      <p className="text-sm font-semibold text-rfp-ink">
        {outstanding.length === 0
          ? "Everything above has an answer"
          : `${outstanding.length} thing${outstanding.length > 1 ? "s" : ""} still to fill in`}
      </p>

      <ul className="mt-3 space-y-1.5">
        {gaps.map((g) => (
          <li key={g.label} className="flex items-start gap-2.5 text-sm">
            <span
              aria-hidden
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                g.done ? "bg-rfp-good/15 text-rfp-good" : "bg-rfp-warning/15 text-rfp-warning"
              }`}
            >
              {g.done ? "✓" : "—"}
            </span>
            <span className="min-w-0">
              <span className={g.done ? "text-rfp-ink-muted line-through" : "text-rfp-ink"}>{g.label}</span>
              {g.optional && !g.done && <span className="ml-1.5 text-xs text-rfp-ink-muted">(optional)</span>}
              {g.note && <span className="mt-0.5 block text-xs leading-relaxed text-rfp-ink-muted">{g.note}</span>}
            </span>
          </li>
        ))}
      </ul>

      {/* Not blocked on the checklist being empty. Khaled may know a gap is
          genuinely not applicable, and a system that refuses to believe him is
          one he works around rather than with. */}
      <label
        htmlFor="profile-confirmed"
        className={`press press-row mt-5 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 ${
          profile.profile_confirmed ? "border-rfp-good/50 bg-rfp-good/5" : "border-rfp-warning/50 bg-rfp-warning/5"
        }`}
      >
        <input
          id="profile-confirmed"
          type="checkbox"
          checked={profile.profile_confirmed}
          onChange={toggle}
          aria-describedby="profile-confirmed-description"
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-rfp-border-strong accent-rfp-black focus-visible:ring-2 focus-visible:ring-rfp-gold"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-rfp-ink">
            Profile confirmed — all of the above is real
          </span>
          <span id="profile-confirmed-description" className="mt-0.5 block text-xs leading-relaxed text-rfp-ink-muted">
            {profile.profile_confirmed
              ? "New verdicts are treated as trustworthy. Untick this if anything goes out of date — solicitations scored while it was ticked keep their verdicts."
              : "Until this is ticked, every verdict is stored and marked provisional. The figures here ship as placeholders, and the desk should not sound certain about numbers nobody has checked."}
          </span>
        </span>
      </label>

      <p aria-live="polite" className="mt-3 text-xs text-rfp-ink-muted">
        {saving ? "Saving…" : profile.profile_confirmed ? "Confirmed" : "Not yet confirmed"}
      </p>
    </div>
  );
}
