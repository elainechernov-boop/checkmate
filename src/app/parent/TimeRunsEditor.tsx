"use client";

import { useState } from "react";
import { formatClockInput, formatClockTime, formatDurationMs } from "@/lib/clockTime";
import { formatTotalMinutes } from "@/lib/estimatedMinutes";
import { COLORS } from "@/lib/theme";
import type { TimeRunView } from "@/lib/timeRunView";
import { addRunAction, deleteRunAction, updateRunTimesAction } from "./time-actions";

/**
 * §15's parent corrections, one run at a time: hairline time inputs to nudge a
 * start or end (saved the moment an edit is committed — blur or Enter), and a
 * delete with a quick inline confirm, since a recorded run can't be undone. A
 * run that's still going shows its start and a stop-time input: that's how a
 * timer somebody forgot to stop gets fixed. Time that was never recorded at all
 * is added with AddTimeForm below.
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
    // A running run only has a stop time to give it.
    if ((isOpen && field === "start") || !value || value === original) {
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
          <>
            <span style={{ color: COLORS.text }}>{formatClockTime(new Date(run.startedAtMs))} –</span>
            <input
              type="time"
              value={end}
              disabled={busy}
              aria-label="Stop time"
              onChange={(event) => setEnd(event.target.value)}
              onBlur={(event) => void commit("end", event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              className="hr-flat-input"
              style={timeInputStyle}
            />
            <span style={{ color: COLORS.muted, fontSize: 11 }}>running now — set a stop time to end it</span>
          </>
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
          <span style={{ color: COLORS.mutedFaint, fontSize: 10.5 }} title="The timer was left running and went silent for hours, so it was closed at its last heartbeat.">
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

/** Minutes between two `HH:MM` values, or null if either is missing/invalid or the end isn't after the start. */
function minutesBetween(start: string, end: string): number | null {
  const parse = (value: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null);
  const from = parse(start);
  const to = parse(end);
  return from !== null && to !== null && to > from ? to - from : null;
}

/**
 * "+ Add time": for work a kid did but never timed — they forgot to start the
 * timer, or a session was lost. Day, when they started, when they stopped; it
 * becomes an ordinary run on that day (marked as entered by hand). The server
 * holds it to the same rules as a timed one — a real span that's already
 * happened, never overlapping another of the student's runs — and its message
 * says which run is in the way.
 */
export function AddTimeForm({ instanceId, defaultDateISO }: { instanceId: string; defaultDateISO: string }) {
  const [open, setOpen] = useState(false);
  const [dateISO, setDateISO] = useState(defaultDateISO);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const minutes = minutesBetween(start, end);

  function reset() {
    setOpen(false);
    setDateISO(defaultDateISO);
    setStart("");
    setEnd("");
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    setBusy(true);
    setError(null);
    try {
      const result = await addRunAction(instanceId, { dateISO, start, end });
      if (result.ok) reset();
      else setError(result.error);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hr-text-action mt-1"
        style={{ color: COLORS.cobalt, fontSize: 12, fontWeight: 500 }}
      >
        + Add time
      </button>
    );
  }

  const labelStyle = { color: COLORS.muted, fontSize: 10.5, letterSpacing: "0.04em", textTransform: "uppercase" } as const;

  return (
    <form onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()} className="mt-2" style={{ fontSize: 12 }}>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <label className="flex flex-col gap-0.5">
          <span style={labelStyle}>Day</span>
          <input type="date" value={dateISO} required onChange={(event) => setDateISO(event.target.value)} className="hr-flat-input" style={{ width: "8.2rem", fontSize: 12 }} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span style={labelStyle}>From</span>
          <input type="time" value={start} required onChange={(event) => setStart(event.target.value)} className="hr-flat-input" style={{ width: "5.6rem", fontSize: 12 }} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span style={labelStyle}>Until</span>
          <input type="time" value={end} required onChange={(event) => setEnd(event.target.value)} className="hr-flat-input" style={{ width: "5.6rem", fontSize: 12 }} />
        </label>
        <span style={{ color: COLORS.muted, minWidth: "3.5rem", paddingBottom: 3 }}>{minutes !== null ? formatTotalMinutes(minutes) : ""}</span>
        <button type="submit" disabled={busy || minutes === null} className="hr-text-action" style={{ color: COLORS.cobalt, fontWeight: 600, paddingBottom: 3 }}>
          Add
        </button>
        <button type="button" onClick={reset} disabled={busy} className="hr-text-action" style={{ color: COLORS.muted, paddingBottom: 3 }}>
          Cancel
        </button>
      </div>
      {error && (
        <p style={{ color: COLORS.crimson, fontSize: 11, marginTop: 4 }} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
