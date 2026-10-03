"use client";

import { useState } from "react";
import { formatClockInput, formatClockTime, formatDurationMs } from "@/lib/clockTime";
import { COLORS } from "@/lib/theme";
import type { TimeRunView } from "@/lib/timeRunView";
import { deleteRunAction, updateRunTimesAction } from "./time-actions";

/**
 * §15's parent corrections, one run at a time: hairline time inputs to nudge a
 * start or end (saved the moment an edit is committed — blur or Enter), and a
 * delete with a quick inline confirm, since a recorded run can't be undone.
 * A run that's still going is shown but not editable. There's deliberately no
 * "add time": untimed work stays untimed.
 */
export function TimeRunRow({
  run,
  showTitle = false,
  note,
}: {
  run: TimeRunView;
  showTitle?: boolean;
  // Quiet text after the duration — the dashboard's ledger puts a task's
  // estimate and the difference here ("est 30 · +5").
  note?: string | null;
}) {
  const isOpen = run.endedAtMs === null;
  const originalStart = formatClockInput(new Date(run.startedAtMs));
  const originalEnd = isOpen ? "" : formatClockInput(new Date(run.endedAtMs!));

  const [start, setStart] = useState(originalStart);
  const [end, setEnd] = useState(originalEnd);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function commit(field: "start" | "end", value: string) {
    const original = field === "start" ? originalStart : originalEnd;
    if (isOpen || !value || value === original) {
      setError(null);
      if (!value) (field === "start" ? setStart : setEnd)(original);
      return;
    }
    setBusy(true);
    try {
      const result = await updateRunTimesAction(run.id, { [field]: value });
      if (result.ok) {
        setError(null);
      } else {
        setError(result.error);
        (field === "start" ? setStart : setEnd)(original);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteRunAction(run.id);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const durationMs = isOpen ? 0 : run.endedAtMs! - run.startedAtMs;
  const timeInputStyle = { width: "5.4rem", color: COLORS.text, fontSize: 12 } as const;

  return (
    <div style={{ padding: "3px 0" }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5" style={{ fontSize: 12 }}>
        {showTitle && (
          <span className="min-w-0 basis-full truncate" style={{ color: COLORS.text }}>
            {run.title}
          </span>
        )}
        {isOpen ? (
          <span style={{ color: COLORS.text }}>
            {formatClockTime(new Date(run.startedAtMs))} – <span style={{ color: COLORS.muted }}>running now</span>
          </span>
        ) : (
          <>
            <input
              type="time"
              value={start}
              disabled={busy}
              aria-label="Start time"
              onChange={(event) => setStart(event.target.value)}
              onBlur={(event) => void commit("start", event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              className="hr-flat-input"
              style={timeInputStyle}
            />
            <span style={{ color: COLORS.mutedFaint }}>–</span>
            <input
              type="time"
              value={end}
              disabled={busy}
              aria-label="End time"
              onChange={(event) => setEnd(event.target.value)}
              onBlur={(event) => void commit("end", event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              className="hr-flat-input"
              style={timeInputStyle}
            />
            <span style={{ color: COLORS.muted }}>{formatDurationMs(durationMs)}</span>
            {note && <span style={{ color: COLORS.muted, fontSize: 11 }}>{note}</span>}
          </>
        )}

        {run.endReason === "lapsed" && (
          <span style={{ color: COLORS.mutedFaint, fontSize: 10.5 }} title="The timer went quiet, so it was closed at its last heartbeat.">
            auto-closed
          </span>
        )}
        {run.editedByParent && (
          <span style={{ color: COLORS.mutedFaint, fontSize: 10.5 }} title="Start or end was corrected in Parent Mode.">
            edited
          </span>
        )}

        <span className="ml-auto flex items-center gap-2">
          {confirming ? (
            <>
              <span style={{ color: COLORS.muted, fontSize: 11 }}>Delete?</span>
              <button type="button" onClick={handleDelete} disabled={busy} className="hr-text-action" style={{ color: COLORS.crimson, fontSize: 11 }}>
                Yes
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="hr-text-action" style={{ color: COLORS.muted, fontSize: 11 }}>
                No
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              aria-label="Delete this run"
              title="Delete this run"
              className="hr-text-action"
              style={{ color: COLORS.mutedFaint, fontSize: 13 }}
            >
              ×
            </button>
          )}
        </span>
      </div>
      {error && (
        <p style={{ color: COLORS.crimson, fontSize: 11, marginTop: 2 }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** A task's runs, listed one per row — the "Time" section of its edit panel. */
export function TimeRunsEditor({ runs }: { runs: TimeRunView[] }) {
  return (
    <div className="flex flex-col">
      {runs.map((run) => (
        // Keyed on the stored times, so a saved correction resets the inputs
        // to the server's value instead of holding stale local state.
        <TimeRunRow key={`${run.id}:${run.startedAtMs}:${run.endedAtMs}`} run={run} />
      ))}
    </div>
  );
}
