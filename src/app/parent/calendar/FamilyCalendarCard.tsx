"use client";

import { useState } from "react";
import { COLORS } from "@/lib/theme";
import { removeFamilyCalendarSettings, saveFamilyCalendarSettings } from "./actions";

const TIME_ZONE_OPTIONS = [
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/New_York", label: "Eastern" },
  { value: "UTC", label: "UTC" },
];

function maskUrl(url: string): string {
  if (url.length <= 28) return url;
  return `${url.slice(0, 24)}…${url.slice(-6)}`;
}

/** HOMEROOM_UX_MIGRATION.md §5.11 — "Family iCal URL contains a secret
 * token. Once connected, show a masked/truncated value plus `Replace`
 * rather than exposing the entire URL by default." "`Remove calendar`
 * requires inline confirmation." */
export function FamilyCalendarCard({
  familyCalendar,
}: {
  familyCalendar: { icsUrl: string; timeZone: string } | null;
}) {
  const [replacing, setReplacing] = useState(!familyCalendar);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  if (familyCalendar && !replacing) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        <span style={{ color: COLORS.muted }}>{maskUrl(familyCalendar.icsUrl)}</span>
        <button type="button" onClick={() => setReplacing(true)} className="hr-text-action" style={{ color: COLORS.text, fontWeight: 600 }}>
          Replace
        </button>
        {confirmingRemove ? (
          <span className="flex items-center gap-2">
            <span style={{ color: COLORS.muted }}>Remove calendar?</span>
            <form action={removeFamilyCalendarSettings}>
              <button type="submit" className="hr-text-action" style={{ color: COLORS.crimson, fontWeight: 600 }}>
                Remove
              </button>
            </form>
            <button type="button" onClick={() => setConfirmingRemove(false)} className="hr-text-action" style={{ color: COLORS.muted }}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmingRemove(true)} className="hr-text-action" style={{ color: COLORS.crimson }}>
            Remove
          </button>
        )}
      </div>
    );
  }

  return (
    <form action={saveFamilyCalendarSettings} className="mt-3 flex flex-wrap items-end gap-4 text-sm">
      <div className="min-w-0 flex-1">
        <label className="block text-xs" style={{ color: COLORS.muted }}>
          Secret iCal address
        </label>
        <input
          type="url"
          name="icsUrl"
          required
          autoFocus
          defaultValue={familyCalendar?.icsUrl ?? ""}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          className="hr-flat-input w-full min-w-64"
        />
      </div>
      <div>
        <label className="block text-xs" style={{ color: COLORS.muted }}>
          Timezone
        </label>
        <select name="timeZone" defaultValue={familyCalendar?.timeZone ?? "America/Los_Angeles"} className="hr-flat-input">
          {TIME_ZONE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="hr-text-action font-medium" style={{ color: COLORS.text }}>
        {familyCalendar ? "Save" : "Connect"}
      </button>
      {familyCalendar && (
        <button type="button" onClick={() => setReplacing(false)} className="hr-text-action" style={{ color: COLORS.muted }}>
          Cancel
        </button>
      )}
    </form>
  );
}
