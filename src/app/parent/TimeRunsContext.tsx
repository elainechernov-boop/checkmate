"use client";

import { createContext, useContext, type ReactNode } from "react";
import { tookMs, type TimeRunView } from "@/lib/timeRunView";

// §15: the runs logged against each of this week's tasks, handed to every row
// on the board without drilling props through the four components between the
// page and a row's edit panel. Absent (null) when the family has time
// tracking off — rows then render exactly as they always have.

export interface TimeRunsData {
  byInstance: Record<string, TimeRunView[]>;
  /** The server's clock when the page loaded — what an open run counts up to. */
  nowMs: number;
  /** Today in the app's own terms (honors DEBUG_TODAY) — where "Add time" defaults to. */
  todayISO: string;
}

const TimeRunsContext = createContext<TimeRunsData | null>(null);

export function TimeRunsProvider({ data, children }: { data: TimeRunsData | null; children: ReactNode }) {
  return <TimeRunsContext.Provider value={data}>{children}</TimeRunsContext.Provider>;
}

/** This task's runs and lifetime total — null when time tracking is off, and
 * an empty `runs` (took 0) for a task nobody has timed. */
export function useInstanceTime(instanceId: string): { runs: TimeRunView[]; tookMs: number; todayISO: string } | null {
  const data = useContext(TimeRunsContext);
  if (!data) return null;
  const runs = data.byInstance[instanceId] ?? [];
  return { runs, tookMs: tookMs(runs, data.nowMs), todayISO: data.todayISO };
}
