import { formatAxisHour, formatClockTime, formatDurationMs, formatSignedDurationMs, minuteOfDay } from "./clockTime";
import { formatDayWeekdayShort, formatMonthDayLine, parseISODate } from "./dates";
import { runDurationMs } from "./timeSummary";
import { toRunView, type TimeRunView } from "./timeRunView";
import type { Dashboard, DashboardTask } from "./timeDashboard";

// §15's dashboard, as plain strings and positions — everything a client
// component needs to draw it, formatted here on the server so the browser
// never has to agree with Node about a timezone or a clock label.

export type BucketKey = "working" | "paused" | "between" | "waiting";

export interface AnswerSegment {
  key: BucketKey;
  label: string;
  valueLabel: string;
  share: number;
  /** Wide enough to carry its value inside the segment — otherwise the legend
   * and the tooltip carry it (a label never gets clipped by its own mark). */
  labelFits: boolean;
}

export interface AnswerView {
  sentence: string;
  segments: AnswerSegment[];
  untimedLabel: string | null;
  dayCount: number;
}

// A segment's inline label needs roughly this share of the bar to sit inside
// with padding on both sides (a value like "2h 46m" at 12px is ~44px wide).
const LABEL_FITS_AT_SHARE = 14;

const BUCKETS: Array<{ key: BucketKey; label: string }> = [
  { key: "waiting", label: "Waiting to start" },
  { key: "working", label: "Working" },
  { key: "paused", label: "Paused" },
  { key: "between", label: "Between tasks" },
];

export function buildAnswerView(dashboard: Dashboard): AnswerView | null {
  const { averages, untimed } = dashboard;
  if (!averages) return null;

  const ms: Record<BucketKey, number> = {
    working: averages.workingMs,
    paused: averages.pausedMs,
    between: averages.betweenMs,
    waiting: averages.waitingMs,
  };

  const lead = averages.days === 1 ? "The day ran" : "School days ran";
  const average = averages.days === 1 ? "" : " on average";
  // Non-breaking spaces inside each duration, so a wrapped line never splits
  // "1h" from "28m".
  const span = (value: number) => formatDurationMs(value).replace(/ /g, "\u00A0");
  const sentence = `${lead} ${span(averages.dayMs)}${average}: ${span(averages.workingMs)} working, ${span(averages.betweenMs)} between tasks.`;

  const segments = BUCKETS.map(({ key, label }) => ({
    key,
    label,
    valueLabel: formatDurationMs(ms[key]),
    share: averages.shares[key],
    labelFits: averages.shares[key] >= LABEL_FITS_AT_SHARE,
  }));

  return {
    sentence,
    segments,
    untimedLabel: untimed.total > 0 ? `${untimed.untimed} of ${untimed.total} tasks untimed.` : null,
    dayCount: averages.days,
  };
}

export interface BlockView {
  /** Percent from the strip's left edge. */
  left: number;
  width: number;
  title: string;
  timeLabel: string;
  durationLabel: string;
}

export type LedgerView =
  | { kind: "run"; run: TimeRunView; note: string | null }
  | { kind: "gap"; label: string; strong: boolean };

export interface DayView {
  dateISO: string;
  weekday: string;
  dateLabel: string;
  workLabel: string;
  pausedLabel: string;
  betweenLabel: string;
  waitingLabel: string;
  dayLabel: string;
  doneLabel: string;
  blocks: BlockView[];
  ledger: LedgerView[];
  /** The ledger's one-line summary, e.g. "Work 3h 15m · between tasks 1h 45m". */
  ledgerSummary: string;
}

export interface AxisView {
  ticks: Array<{ left: number; label: string }>;
}

/** A gap is called out in the ledger when it's the day's longest between-task
 * gap and at least this long — the one worth noticing. */
const STRONG_GAP_MS = 20 * 60_000;

export function buildAxisView(dashboard: Dashboard): AxisView | null {
  const { axis } = dashboard;
  if (!axis) return null;
  const span = axis.endMin - axis.startMin;
  const ticks: AxisView["ticks"] = [];
  for (let minute = axis.startMin; minute < axis.endMin; minute += 60) {
    ticks.push({ left: ((minute - axis.startMin) / span) * 100, label: formatAxisHour(minute) });
  }
  return { ticks };
}

export function buildDayViews(dashboard: Dashboard, tasks: DashboardTask[], now: Date): DayView[] {
  const { axis } = dashboard;
  if (!axis) return [];
  const span = axis.endMin - axis.startMin;
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const position = (date: Date) => Math.min(100, Math.max(0, ((minuteOfDay(date) - axis.startMin) / span) * 100));

  return dashboard.days.map(({ dateISO, summary }) => {
    const date = parseISODate(dateISO);
    const weekdayUpper = formatDayWeekdayShort(date);

    const blocks: BlockView[] = summary.runs.map(({ run, start, end }) => ({
      left: position(start),
      width: Math.max(0.4, position(end) - position(start)),
      title: run.title,
      timeLabel: `${formatClockTime(start)} – ${formatClockTime(end)}`,
      durationLabel: formatDurationMs(end.getTime() - start.getTime()),
    }));

    // The ledger: each run in order with the gaps written between the rows.
    // A task's estimate and the difference ride on its last run of the day,
    // measured against everything it logged that day.
    const lastRunIndexOfTask = new Map<string, number>();
    const dayTotalOfTask = new Map<string, number>();
    summary.runs.forEach(({ run }, index) => {
      const key = run.instanceId ?? `deleted:${run.title}`;
      lastRunIndexOfTask.set(key, index);
      dayTotalOfTask.set(key, (dayTotalOfTask.get(key) ?? 0) + runDurationMs(run, now));
    });

    const betweenGaps = summary.gaps.filter((gap) => gap.kind === "between");
    const longestBetween = betweenGaps.reduce((max, gap) => Math.max(max, gap.ms), 0);

    const ledger: LedgerView[] = [];
    summary.runs.forEach(({ run }, index) => {
      const key = run.instanceId ?? `deleted:${run.title}`;
      const estimate = run.instanceId ? taskById.get(run.instanceId)?.estimatedMinutes : null;
      let note: string | null = null;
      if (estimate && estimate > 0 && lastRunIndexOfTask.get(key) === index) {
        const difference = formatSignedDurationMs((dayTotalOfTask.get(key) ?? 0) - estimate * 60_000);
        note = `est ${estimate} · ${difference.replace(/ min$/, "")}`;
      }
      ledger.push({ kind: "run", run: toRunView(run), note });

      const gap = summary.gaps.find((candidate) => candidate.before === run && candidate.after === summary.runs[index + 1]?.run);
      if (gap) {
        const word = gap.kind === "paused" ? "paused" : "between";
        ledger.push({
          kind: "gap",
          label: `${formatDurationMs(gap.ms)} ${word}`,
          strong: gap.kind === "between" && gap.ms === longestBetween && gap.ms >= STRONG_GAP_MS,
        });
      }
    });

    return {
      dateISO,
      weekday: weekdayUpper.charAt(0) + weekdayUpper.slice(1).toLowerCase(),
      dateLabel: formatMonthDayLine(date),
      workLabel: formatDurationMs(summary.workingMs),
      pausedLabel: formatDurationMs(summary.pausedMs),
      betweenLabel: formatDurationMs(summary.betweenMs),
      waitingLabel: formatDurationMs(summary.waitingMs),
      dayLabel: formatDurationMs(summary.dayMs),
      doneLabel: summary.lastEnd ? formatClockTime(summary.lastEnd) : "",
      blocks,
      ledger,
      ledgerSummary: `Work ${formatDurationMs(summary.workingMs)} · between tasks ${formatDurationMs(summary.betweenMs)}`,
    };
  });
}
