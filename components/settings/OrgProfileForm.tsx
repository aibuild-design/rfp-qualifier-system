"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OrgProfileRow } from "@/lib/supabase/types";

// The org-wide eligibility profile (module 3) — confirmed once, read by the
// disqualifier gate on every RFP. A singleton row (id is always `true`).
export function OrgProfileForm({ initial }: { initial: OrgProfileRow }) {
  const [profile, setProfile] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function save(next: OrgProfileRow) {
    setProfile(next);
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("org_profile")
      .update({
        bilingual_staff: next.bilingual_staff,
        media_production_capable: next.media_production_capable,
        pr_capable: next.pr_capable,
        office_locations: next.office_locations,
        consultant_locations: next.consultant_locations,
        certifications: next.certifications,
        set_aside_status: next.set_aside_status,
        notes: next.notes,
        profile_confirmed: next.profile_confirmed,
      })
      .eq("id", true);
    setSaving(false);
    setSavedAt(Date.now());
  }

  function toggle(field: "bilingual_staff" | "media_production_capable" | "pr_capable") {
    void save({ ...profile, [field]: !profile[field] });
  }

  function updateList(field: "office_locations" | "consultant_locations" | "certifications" | "set_aside_status", value: string) {
    const list = value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    setProfile({ ...profile, [field]: list });
  }

  function commitList(field: "office_locations" | "consultant_locations" | "certifications" | "set_aside_status") {
    void save(profile);
    void field;
  }

  return (
    <div className="rounded-xl border border-rfp-border bg-rfp-surface p-5">
      <div className="flex flex-wrap gap-6">
        <Checkbox label="Bilingual staff" checked={profile.bilingual_staff} onChange={() => toggle("bilingual_staff")} />
        <Checkbox
          label="Media production capable"
          checked={profile.media_production_capable}
          onChange={() => toggle("media_production_capable")}
        />
        <Checkbox label="PR capable" checked={profile.pr_capable} onChange={() => toggle("pr_capable")} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ListField
          label="Office locations"
          value={profile.office_locations.join(", ")}
          onChange={(v) => updateList("office_locations", v)}
          onBlur={() => commitList("office_locations")}
        />
        <ListField
          label="Consultant locations"
          value={profile.consultant_locations.join(", ")}
          onChange={(v) => updateList("consultant_locations", v)}
          onBlur={() => commitList("consultant_locations")}
        />
        <ListField
          label="Certifications"
          value={profile.certifications.join(", ")}
          onChange={(v) => updateList("certifications", v)}
          onBlur={() => commitList("certifications")}
        />
        <ListField
          label="Set-aside status"
          value={profile.set_aside_status.join(", ")}
          onChange={(v) => updateList("set_aside_status", v)}
          onBlur={() => commitList("set_aside_status")}
        />
      </div>

      <div className="mt-4 space-y-1.5">
        <label className="text-sm font-medium text-rfp-ink-secondary">Notes</label>
        <textarea
          value={profile.notes ?? ""}
          onChange={(e) => setProfile({ ...profile, notes: e.target.value })}
          onBlur={() => save(profile)}
          rows={3}
          className="w-full min-h-11 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2.5 text-base sm:text-sm text-rfp-ink focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60"
        />
      </div>

      {/* The sign-off. Deliberately the last thing on the form and worded as a
          claim about reality rather than a preference, because ticking it is
          what stops every new verdict being stamped provisional. Unticking it
          is allowed and is the right move if anything above goes stale. */}
      <label
        htmlFor="profile-confirmed"
        className={`press press-row mt-6 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 ${
          profile.profile_confirmed
            ? "border-rfp-good/50 bg-rfp-good/5"
            : "border-rfp-warning/50 bg-rfp-warning/5"
        }`}
      >
        <input
          id="profile-confirmed"
          type="checkbox"
          checked={profile.profile_confirmed}
          onChange={() => void save({ ...profile, profile_confirmed: !profile.profile_confirmed })}
          aria-describedby="profile-confirmed-description"
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-rfp-border-strong accent-rfp-black focus-visible:ring-2 focus-visible:ring-rfp-gold"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-rfp-ink">
            Profile confirmed — everything above is real
          </span>
          <span id="profile-confirmed-description" className="mt-0.5 block text-xs leading-relaxed text-rfp-ink-muted">
            {profile.profile_confirmed
              ? "New verdicts are treated as trustworthy. Untick this if anything above goes out of date."
              : "Until this is ticked, every verdict is stored and marked provisional — the figures above ship as placeholders and the desk should not sound certain about numbers nobody has checked."}
          </span>
        </span>
      </label>

      <p className="mt-3 text-xs text-rfp-ink-muted">{saving ? "Saving…" : savedAt ? "Saved" : "Autosaves on change"}</p>
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-rfp-ink-secondary">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-rfp-border-strong text-rfp-black accent-rfp-black"
      />
      {label}
    </label>
  );
}

function ListField({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-rfp-ink-secondary">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="Comma-separated"
        className="w-full min-h-11 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2.5 text-base sm:text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60"
      />
    </div>
  );
}
