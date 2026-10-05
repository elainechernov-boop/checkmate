import { InstanceStatus } from "@/generated/prisma/enums";
import { minuteOfDay, wallClockInstant, zonedDateISO } from "./clockTime";
import { parseISODate, toISODate } from "./dates";
import { runDurationMs, summarizeDay, type DayGap, type DaySummary, type RunLike } from "./timeSummary";
import type { TimeRunRecord } from "./timeRunView";

// §15's Time dashboard, as numbers. Pure: runs and tasks go in, everything the
// page shows comes out — so the buckets, the averages, the untimed count, the
// per-subject table, the overruns, and the longest gaps can all be tested
// without a database or a browser.

export const NO_SUBJECT_LABEL = "No subject";

/** A TimeEntry, as far as the dashboard reads one — `date` is the calendar day
 * the run is attributed to (UTC midnight). */
export type DashboardRun = TimeRunRecord & RunLike;

export interface DashboardTask {
  id: string;
  title: string;
  status: InstanceStatus;
  subjectId: string | null;
  /** The instance's estimate, or its series' when it has none of its own. */
  estimatedMinutes: number | null;
  completedAt: Date | null;
}

export interface BuildDashboardInput {
  /** Every run attributed to a day in [from, to]. */
  runs: DashboardRun[];
  /** The tasks those runs belong to, plus every task completed in the range
   * (so a task finished with no timer still counts as untimed). */
  tasks: DashboardTask[];
  /** Every task that has ever had a run, on any date — "untimed" means never
   * timed at all, not merely untimed inside this range. */
  timedTaskIds: Set<string>;
  subjectNames: Map<string, string>;
  schoolDayStartTime: string | null;
  from: Date;
  to: Date;
  now: Date;
}

export interface DashboardDay {
  dateISO: string;
  summary: DaySummary<DashboardRun>;
}

export interface BucketAverages {
  days: number;
  dayMs: number;
  workingMs: number;
  pausedMs: number;
  betweenMs: number;
  waitingMs: number;
  /** Whole-number shares of the day, summing to exactly 100. */
  shares: { working: number; paused: number; between: number; waiting: number };
}

export interface SubjectRow {
  subjectId: string | null;
  name: string;
  tasks: number;
  totalMs: number;
  avgPerTaskMs: number;
  avgEstimateMinutes: number | null;
  /** Mean of (actual − estimate) over finished tasks that have both; null if none. */
  overUnderMs: number | null;
}

export interface OverrunRow {
  taskId: string | null;
  title: string;
  subjectName: string;
  estimateMinutes: number;
  actualMs: number;
  overageMs: number;
  /** How many calendar days the work was spread over (1 unless it rolled). */
  days: number;
}

export interface GapRow {
  dateISO: string;
  ms: number;
  fromLabel: string;
  toLabel: string;
  at: Date;
}

export interface DashboardAxis {
  /** Minutes since local midnight, rounded out to whole hours. */
  startMin: number;
  endMin: number;
}

export interface Dashboard {
  days: DashboardDay[];
  averages: BucketAverages | null;
  untimed: { untimed: number; total: number };
  subjects: SubjectRow[];
  overruns: OverrunRow[];
  longestGaps: GapRow[];
  axis: DashboardAxis | null;
}

/** A Sunday isn't a school day: time on it is a head start on Monday (§15). */
export const isHeadStartDate = (dateISO: string): boolean => parseISODate(dateISO).getUTCDay() === 0;

/** Whole-number percentages of `values` that sum to exactly 100 (largest
 * remainder), so a stacked bar's labels never add up to 99 or 101. */
export function shareOfTotal(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((value) => (value / total) * 100);
  const floors = raw.map(Math.floor);
  let remaining = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const { index } of order) {
    if (remaining <= 0) break;
    floors[index] += 1;
    remaining -= 1;
  }
  return floors;
}

const isFinished = (task: DashboardTask | undefined): boolean =>
  task?.status === InstanceStatus.done || task?.status === InstanceStatus.pendingReview;

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

export function buildDashboard(input: BuildDashboardInput): Dashboard {
  const { runs, tasks, timedTaskIds, subjectNames, schoolDayStartTime, from, to, now } = input;
  const fromISO = toISODate(from);
  const toISO = toISODate(to);
  const inRange = runs.filter((run) => {
    const dateISO = toISODate(run.date);
    return dateISO >= fromISO && dateISO <= toISO;
  });
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  // ---- days & buckets -----------------------------------------------------
  const byDate = new Map<string, DashboardRun[]>();
  for (const run of inRange) {
    const dateISO = toISODate(run.date);
    byDate.set(dateISO, [...(byDate.get(dateISO) ?? []), run]);
  }
  const days: DashboardDay[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateISO, dayRuns]) => {
      // No school-day start to have been late for on a head-start Sunday.
      const schoolStart =
        schoolDayStartTime && !isHeadStartDate(dateISO) ? wallClockInstant(dateISO, schoolDayStartTime) : null;
      return { dateISO, summary: summarizeDay(dayRuns, now, schoolStart) };
    })
    .filter((day) => day.summary.runs.length > 0);

  // "How long does a school day run" — averaged over school days only. A
  // Sunday head start still shows in the strips, but a short Sunday session
  // would otherwise pull the average school day down.
  const schoolDays = days.filter((day) => !isHeadStartDate(day.dateISO));
  let averages: BucketAverages | null = null;
  if (schoolDays.length > 0) {
    const avg = (pick: (summary: DaySummary<DashboardRun>) => number) =>
      schoolDays.reduce((sum, day) => sum + pick(day.summary), 0) / schoolDays.length;
    const workingMs = avg((s) => s.workingMs);
    const pausedMs = avg((s) => s.pausedMs);
    const betweenMs = avg((s) => s.betweenMs);
    const waitingMs = avg((s) => s.waitingMs);
    const [working, paused, between, waiting] = shareOfTotal([workingMs, pausedMs, betweenMs, waitingMs]);
    averages = {
      days: schoolDays.length,
      dayMs: avg((s) => s.dayMs),
      workingMs,
      pausedMs,
      betweenMs,
      waitingMs,
      shares: { working, paused, between, waiting },
    };
  }

  // ---- untimed ------------------------------------------------------------
  const completedInRange = tasks.filter((task) => {
    if (!(task.status === InstanceStatus.done || task.status === InstanceStatus.pendingReview) || !task.completedAt) {
      return false;
    }
    const dateISO = zonedDateISO(task.completedAt);
    return dateISO >= fromISO && dateISO <= toISO;
  });
  const untimed = {
    untimed: completedInRange.filter((task) => !timedTaskIds.has(task.id)).length,
    total: completedInRange.length,
  };

  // ---- per task, then per subject ------------------------------------------
  interface TaskAgg {
    taskId: string | null;
    title: string;
    subjectId: string | null;
    actualMs: number;
    dates: Set<string>;
    task: DashboardTask | undefined;
  }
  const aggs = new Map<string, TaskAgg>();
  for (const run of inRange) {
    const key = run.instanceId ?? `deleted:${run.title}`;
    const agg =
      aggs.get(key) ??
      ({
        taskId: run.instanceId,
        title: run.title,
        subjectId: run.subjectId,
        actualMs: 0,
        dates: new Set<string>(),
        task: run.instanceId ? taskById.get(run.instanceId) : undefined,
      } satisfies TaskAgg);
    agg.actualMs += runDurationMs(run, now);
    agg.dates.add(toISODate(run.date));
    aggs.set(key, agg);
  }
  const nameOf = (subjectId: string | null) => (subjectId ? (subjectNames.get(subjectId) ?? NO_SUBJECT_LABEL) : NO_SUBJECT_LABEL);
  const estimateMsOf = (agg: TaskAgg) =>
    agg.task?.estimatedMinutes && agg.task.estimatedMinutes > 0 ? agg.task.estimatedMinutes * 60_000 : null;

  const bySubject = new Map<string | null, TaskAgg[]>();
  for (const agg of aggs.values()) bySubject.set(agg.subjectId, [...(bySubject.get(agg.subjectId) ?? []), agg]);

  const subjects: SubjectRow[] = [...bySubject.entries()]
    .map(([subjectId, group]) => {
      const totalMs = group.reduce((sum, agg) => sum + agg.actualMs, 0);
      const estimates = group.map(estimateMsOf).filter((ms): ms is number => ms !== null);
      const deltas = group
        .filter((agg) => isFinished(agg.task) && estimateMsOf(agg) !== null)
        .map((agg) => agg.actualMs - estimateMsOf(agg)!);
      const avgEstimateMs = mean(estimates);
      return {
        subjectId,
        name: nameOf(subjectId),
        tasks: group.length,
        totalMs,
        avgPerTaskMs: totalMs / group.length,
        avgEstimateMinutes: avgEstimateMs === null ? null : avgEstimateMs / 60_000,
        overUnderMs: mean(deltas),
      };
    })
    .sort((a, b) => b.totalMs - a.totalMs);

  const overruns: OverrunRow[] = [...aggs.values()]
    .filter((agg) => isFinished(agg.task) && estimateMsOf(agg) !== null && agg.actualMs > 0)
    .map((agg) => ({
      taskId: agg.taskId,
      title: agg.title,
      subjectName: nameOf(agg.subjectId),
      estimateMinutes: estimateMsOf(agg)! / 60_000,
      actualMs: agg.actualMs,
      overageMs: agg.actualMs - estimateMsOf(agg)!,
      days: agg.dates.size,
    }))
    .filter((row) => row.overageMs > 0)
    .sort((a, b) => b.overageMs - a.overageMs)
    .slice(0, 10);

  // ---- longest gaps between tasks -------------------------------------------
  const labelFor = (run: DashboardRun) => (run.subjectId ? nameOf(run.subjectId) : run.title);
  const longestGaps: GapRow[] = days
    .flatMap((day) =>
      day.summary.gaps
        .filter((gap: DayGap<DashboardRun>) => gap.kind === "between")
        .map((gap) => ({
          dateISO: day.dateISO,
          ms: gap.ms,
          fromLabel: labelFor(gap.before),
          toLabel: labelFor(gap.after),
          at: gap.from,
        }))
    )
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 8);

  // ---- shared clock axis for the strips ------------------------------------
  let axis: DashboardAxis | null = null;
  if (days.length > 0) {
    const starts = days.map((day) => minuteOfDay(day.summary.dayStart!));
    const ends = days.map((day) => minuteOfDay(day.summary.lastEnd!));
    const startMin = Math.floor(Math.min(...starts) / 60) * 60;
    let endMin = Math.ceil(Math.max(...ends) / 60) * 60;
    if (endMin - startMin < 180) endMin = startMin + 180; // never a cramped axis
    axis = { startMin, endMin };
  }

  return { days, averages, untimed, subjects, overruns, longestGaps, axis };
}
