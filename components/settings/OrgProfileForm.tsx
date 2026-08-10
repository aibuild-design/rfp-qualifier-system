"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OrgProfileRow } from "@/lib/supabase/types";

// The org-wide eligibility profile (module 3) - confirmed once, read by the
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
        insurance_coverage: next.insurance_coverage,
        governing_body_experience: next.governing_body_experience,
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
        <label htmlFor="insurance" className="text-sm font-medium text-rfp-ink-secondary">
          Insurance carried
        </label>
        <p className="text-xs leading-relaxed text-rfp-ink-muted">
          Types and limits, in your own words. Every solicitation that names an insurance
          requirement currently stalls at <span className="font-medium text-rfp-ink">maybe</span>
          {" "}because the desk has no way to check it.
        </p>
        <textarea
          id="insurance"
          value={profile.insurance_coverage ?? ""}
          onChange={(e) => setProfile({ ...profile, insurance_coverage: e.target.value })}
          onBlur={() => save(profile)}
          rows={2}
          placeholder="e.g. General liability $2M per occurrence / $4M aggregate; professional liability $1M; auto and workers' comp per California statute"
          className="w-full min-h-11 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2.5 text-base sm:text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60"
        />
      </div>

      <div className="mt-4 space-y-1.5">
        <label htmlFor="governing" className="text-sm font-medium text-rfp-ink-secondary">
          Facilitating elected or appointed bodies
        </label>
        <p className="text-xs leading-relaxed text-rfp-ink-muted">
          Councils, boards, commissions. A mandatory requirement in most transit and
          public-agency solicitations, and the single most common reason a bid sits unresolved.
        </p>
        <textarea
          id="governing"
          value={profile.governing_body_experience ?? ""}
          onChange={(e) => setProfile({ ...profile, governing_body_experience: e.target.value })}
          onBlur={() => save(profile)}
          rows={2}
          placeholder="e.g. Board retreats and strategic planning committees for transit boards, water district boards and university governance since 2014"
          className="w-full min-h-11 rounded-lg border border-rfp-border bg-rfp-surface-sunken px-3 py-2.5 text-base sm:text-sm text-rfp-ink placeholder:text-rfp-ink-muted focus:border-rfp-gold focus:bg-rfp-surface focus:outline-none focus:ring-2 focus:ring-rfp-gold/60"
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
