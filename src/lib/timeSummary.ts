// §15 — the pure arithmetic behind the Time dashboard. Nothing here touches
// the database: runs go in, buckets come out, so every rule in the spec can
// be tested exhaustively without a fixture.

/** Runs under this are discarded when they close — an accidental tap, and
 * also how a student checks off work done away from the Mac (§15). */
export const MIN_RUN_MS = 10_000;

/** An open run with no heartbeat for this long is treated as abandoned and
 * ended at its last ping (lid shut overnight, tab closed and forgotten).
 *
 * Deliberately long. A browser stops sending heartbeats from a background
 * window, so silence alone can't tell "walked away" from "working on paper with
 * the timer window behind something else" — and throwing away real work is the
 * worse mistake (a kid loses trust in the timer; a forgotten one is a long run
 * the parent can trim). Anything shorter than this is kept and the kid is
 * asked, see AWAY_AFTER_MS. */
export const LAPSE_AFTER_MS = 2 * 60 * 60_000;

/** Silence this long on a run that's still open is worth a question when the
 * window comes back ("Welcome back — keep that time?"), and means the run
 * can't be trusted to have been going when the kid moves on to another task. */
export const AWAY_AFTER_MS = 5 * 60_000;

/** How often the open timer screen pings the server. */
export const PING_INTERVAL_MS = 30_000;

export interface RunLike {
  instanceId: string | null;
  title: string;
  startedAt: Date;
  endedAt: Date | null;
  lastPingAt: Date;
}

/** Where a run effectively ends as of `now`: its real end if closed; else
 * `now` while it's open, or its last ping once it has been silent long enough
 * to count as abandoned (LAPSE_AFTER_MS — so an abandoned-but-not-yet-swept run
 * is never counted up to "now"). A run that's merely quiet for a while is still
 * running: see LAPSE_AFTER_MS for why. */
export function runEnd(run: RunLike, now: Date): Date {
  if (run.endedAt) return run.endedAt;
  const quietMs = now.getTime() - run.lastPingAt.getTime();
  return quietMs > LAPSE_AFTER_MS ? run.lastPingAt : now;
}

export function runDurationMs(run: RunLike, now: Date): number {
  return Math.max(0, runEnd(run, now).getTime() - run.startedAt.getTime());
}

export function totalRunMs(runs: RunLike[], now: Date): number {
  return runs.reduce((sum, run) => sum + runDurationMs(run, now), 0);
}

/** Two runs are the same task when they point at the same instance. A run
 * whose assignment has since been deleted (instanceId null) falls back to its
 * title snapshot: two such runs with the same title on one day are almost
 * certainly one task paused and resumed before it was removed. */
function taskKey(run: RunLike): string {
  return run.instanceId ?? `deleted:${run.title}`;
}

export type GapKind = "paused" | "between";

export interface DayGap<R extends RunLike = RunLike> {
  kind: GapKind;
  from: Date;
  to: Date;
  ms: number;
  before: R;
  after: R;
}

export interface NormalizedRun<R extends RunLike = RunLike> {
  run: R;
  start: Date;
  end: Date;
}

export interface DaySummary<R extends RunLike = RunLike> {
  workingMs: number;
  pausedMs: number;
  betweenMs: number;
  waitingMs: number;
  /** working + paused + between + waiting, always — see summarizeDay. */
  dayMs: number;
  /** First run's start / last run's end; null for a day with no runs. */
  firstStart: Date | null;
  lastEnd: Date | null;
  /** The earlier of the school-day start and the first start. */
  dayStart: Date | null;
  runs: NormalizedRun<R>[];
  gaps: DayGap<R>[];
}

/**
 * §15's four buckets for one student on one day. Runs are ordered by start;
 * then:
 *   working = sum of run durations
 *   paused  = gaps between consecutive runs of the *same* task
 *   between = every other gap
 *   waiting = first start minus the school-day start (only if that's set and
 *             the first start came later)
 * and the day runs from the earlier of the school start and the first start
 * to the last run's end — so the four always sum to the day exactly.
 *
 * A run that overlaps the one before it (which the one-open-run rule and the
 * parent's edit validation both prevent, but data is data) is clipped to start
 * where the previous one ended, so the sum property survives it.
 */
export function summarizeDay<R extends RunLike>(runs: R[], now: Date, schoolStart: Date | null = null): DaySummary<R> {
  const sorted = [...runs].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  const normalized: NormalizedRun<R>[] = [];
  let cursor: Date | null = null;
  for (const run of sorted) {
    const start = cursor && cursor.getTime() > run.startedAt.getTime() ? cursor : run.startedAt;
    const end = runEnd(run, now);
    if (end.getTime() <= start.getTime()) continue;
    normalized.push({ run, start, end });
    cursor = end;
  }

  if (normalized.length === 0) {
    return {
      workingMs: 0,
      pausedMs: 0,
      betweenMs: 0,
      waitingMs: 0,
      dayMs: 0,
      firstStart: null,
      lastEnd: null,
      dayStart: null,
      runs: [],
      gaps: [],
    };
  }

  let workingMs = 0;
  let pausedMs = 0;
  let betweenMs = 0;
  const gaps: DayGap<R>[] = [];

  normalized.forEach((current, index) => {
    workingMs += current.end.getTime() - current.start.getTime();
    const next = normalized[index + 1];
    if (!next) return;
    const ms = next.start.getTime() - current.end.getTime();
    if (ms <= 0) return;
    const kind: GapKind = taskKey(current.run) === taskKey(next.run) ? "paused" : "between";
    if (kind === "paused") pausedMs += ms;
    else betweenMs += ms;
    gaps.push({ kind, from: current.end, to: next.start, ms, before: current.run, after: next.run });
  });

  const firstStart = normalized[0].start;
  const lastEnd = normalized[normalized.length - 1].end;
  const waitingMs = schoolStart && firstStart.getTime() > schoolStart.getTime() ? firstStart.getTime() - schoolStart.getTime() : 0;
  const dayStart = schoolStart && schoolStart.getTime() < firstStart.getTime() ? schoolStart : firstStart;

  return {
    workingMs,
    pausedMs,
    betweenMs,
    waitingMs,
    dayMs: lastEnd.getTime() - dayStart.getTime(),
    firstStart,
    lastEnd,
    dayStart,
    runs: normalized,
    gaps,
  };
}
