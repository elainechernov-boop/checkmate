import type { TimeEntry } from "@/generated/prisma/client";
import { runDurationMs, type RunLike } from "./timeSummary";

/** A run as Parent Mode's client components see it: plain numbers and
 * strings, safe to serialize across the server/client boundary. */
export interface TimeRunView {
  id: string;
  /** Null for a run whose assignment has since been deleted. */
  instanceId: string | null;
  title: string;
  subjectId: string | null;
  /** The calendar day the run is attributed to (yyyy-mm-dd). */
  date: string;
  startedAtMs: number;
  /** Null while the run is still going. */
  endedAtMs: number | null;
  lastPingAtMs: number;
  endReason: "paused" | "finished" | "switched" | "lapsed" | null;
  editedByParent: boolean;
}

/** The slice of a TimeEntry a run view reads — so the dashboard's own run type
 * (which is exactly this) converts without a cast. */
export type TimeRunRecord = Pick<
  TimeEntry,
  | "id"
  | "instanceId"
  | "title"
  | "subjectId"
  | "date"
  | "startedAt"
  | "endedAt"
  | "lastPingAt"
  | "endReason"
  | "editedByParent"
>;

export function toRunView(run: TimeRunRecord): TimeRunView {
  return {
    id: run.id,
    instanceId: run.instanceId,
    title: run.title,
    subjectId: run.subjectId,
    date: run.date.toISOString().slice(0, 10),
    startedAtMs: run.startedAt.getTime(),
    endedAtMs: run.endedAt ? run.endedAt.getTime() : null,
    lastPingAtMs: run.lastPingAt.getTime(),
    endReason: run.endReason,
    editedByParent: run.editedByParent,
  };
}

/** Back to the Date-based shape timeSummary.ts works in. */
export function runViewToLike(run: TimeRunView): RunLike {
  return {
    instanceId: run.instanceId,
    title: run.title,
    startedAt: new Date(run.startedAtMs),
    endedAt: run.endedAtMs === null ? null : new Date(run.endedAtMs),
    lastPingAt: new Date(run.lastPingAtMs),
  };
}

/** A task's lifetime time across all its runs, an open one counted up to
 * `nowMs` (or, if it has gone quiet, its last ping — see runEnd). */
export function tookMs(runs: TimeRunView[], nowMs: number): number {
  const now = new Date(nowMs);
  return runs.reduce((sum, run) => sum + runDurationMs(runViewToLike(run), now), 0);
}
