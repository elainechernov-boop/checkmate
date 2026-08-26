import type { PrismaClient } from "@/generated/prisma/client";
import { parseICS, type CalendarResponse } from "node-ical";
import { toISODate } from "./dates";

// node-ical resolves a date-only (VALUE=DATE) ICS value using the running
// process's local timezone, which would otherwise make an all-day event's
// calendar date depend on wherever this happens to be deployed. Pinning
// the process to UTC once, here, makes that resolution match this app's
// own "dates are plain UTC-midnight values" convention (dates.ts)
// regardless of the host — this app never relies on local-timezone
// formatting anywhere else, so there's nothing else this could affect.
process.env.TZ = "UTC";

const FETCH_TIMEOUT_MS = 8000;

type SettingsPrisma = Pick<PrismaClient, "familyCalendarSettings">;

export interface FamilyCalendarSettingsData {
  icsUrl: string;
  timeZone: string;
}

export async function getFamilyCalendarSettings(prisma: SettingsPrisma): Promise<FamilyCalendarSettingsData | null> {
  const row = await prisma.familyCalendarSettings.findFirst();
  return row ? { icsUrl: row.icsUrl, timeZone: row.timeZone } : null;
}

export async function setFamilyCalendarSettings(
  prisma: SettingsPrisma,
  icsUrl: string,
  timeZone: string
): Promise<void> {
  const existing = await prisma.familyCalendarSettings.findFirst();
  if (existing) {
    await prisma.familyCalendarSettings.update({ where: { id: existing.id }, data: { icsUrl, timeZone } });
  } else {
    await prisma.familyCalendarSettings.create({ data: { icsUrl, timeZone } });
  }
}

export async function clearFamilyCalendarSettings(prisma: SettingsPrisma): Promise<void> {
  await prisma.familyCalendarSettings.deleteMany();
}

type DismissedPrisma = Pick<PrismaClient, "dismissedCalendarEvent">;

/** ParentWeekBoard's CalendarEventRow hover-X — the feed is read-only, so
 * this just remembers to hide this one occurrence going forward (see
 * DismissedCalendarEvent). Upserted, not a plain create: the row's own id
 * comes from the client's already-rendered event, so a duplicate dismiss
 * (double-click, or the same event re-rendering before the page catches up)
 * should silently no-op rather than throwing on the unique constraint. */
export async function dismissCalendarEvent(prisma: DismissedPrisma, eventKey: string): Promise<void> {
  await prisma.dismissedCalendarEvent.upsert({
    where: { eventKey },
    update: {},
    create: { eventKey },
  });
}

export async function getDismissedEventKeys(prisma: DismissedPrisma): Promise<Set<string>> {
  const rows = await prisma.dismissedCalendarEvent.findMany({ select: { eventKey: true } });
  return new Set(rows.map((row) => row.eventKey));
}

type CalendarAssignmentPrisma = Pick<PrismaClient, "calendarEventAssignment">;

/** The redesign's drag-or-tap-to-assign (replaces the old one-way "convert
 * to a real to-do" — see design_handoff_homeroom_redesign/README.md). Same
 * upsert-on-conflict shape as dismissCalendarEvent above, keyed on the
 * (event, student) pair since one event can be assigned to more than one kid. */
export async function assignCalendarEvent(prisma: CalendarAssignmentPrisma, eventKey: string, studentId: string): Promise<void> {
  await prisma.calendarEventAssignment.upsert({
    where: { eventKey_studentId: { eventKey, studentId } },
    update: {},
    create: { eventKey, studentId },
  });
}

export async function unassignCalendarEvent(prisma: CalendarAssignmentPrisma, eventKey: string, studentId: string): Promise<void> {
  await prisma.calendarEventAssignment.deleteMany({ where: { eventKey, studentId } });
}

/** All (eventKey, studentId) assignments at once — the shared agenda strip
 * needs to know which events to hide (any row with >=1 assignment), and
 * each student's board needs to know which events are theirs, so one query
 * feeds both instead of round-tripping per student. */
export async function getCalendarEventAssignments(
  prisma: CalendarAssignmentPrisma
): Promise<{ eventKey: string; studentId: string }[]> {
  return prisma.calendarEventAssignment.findMany({ select: { eventKey: true, studentId: true } });
}

export interface FamilyCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  // The calendar date (YYYY-MM-DD) this event is bucketed under for
  // display — the family's own local day for a timed event (an ICS
  // instant is timezone-agnostic; "which day it shows up on" isn't), or
  // the plain UTC date already baked into an all-day value.
  dateISO: string;
  // Pre-formatted in the family's own timezone (e.g. "9:00 AM") — null for
  // an all-day event. Computed here rather than shipped to the client as a
  // bare Date, so the client never needs to know the family's timezone too.
  timeLabel: string | null;
}

function localDateISO(date: Date, timeZone: string): string {
  // en-CA's YYYY-MM-DD output is the one built-in Intl locale format that
  // needs no reassembly — Intl.DateTimeFormat's own `timeZone` option
  // does the real timezone conversion, independent of process.env.TZ.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function localTimeLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(date);
}

/**
 * Fetches and parses the family's imported calendar (§ Parent Mode "on top
 * of the view"), returning only events that land on a day within
 * [rangeStart, rangeEnd) once bucketed into the family's own timezone.
 * Recurring events are expanded to their individual occurrences in range.
 * Never throws for a bad/unreachable URL or malformed feed — callers treat
 * "couldn't load it this time" the same as "nothing configured," so one
 * flaky fetch never breaks the week view around it.
 */
export async function fetchFamilyCalendarEvents(
  settings: FamilyCalendarSettingsData,
  rangeStart: Date,
  rangeEnd: Date
): Promise<FamilyCalendarEvent[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let text: string;
  try {
    const response = await fetch(settings.icsUrl, { signal: controller.signal });
    if (!response.ok) return [];
    text = await response.text();
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }

  let parsed: CalendarResponse;
  try {
    parsed = parseICS(text);
  } catch {
    return [];
  }

  const events: FamilyCalendarEvent[] = [];

  for (const key of Object.keys(parsed)) {
    const entry = parsed[key];
    if (!entry || entry.type !== "VEVENT") continue;
    if (!entry.start) continue;

    const allDay = entry.datetype === "date";
    const durationMs = entry.end ? entry.end.getTime() - entry.start.getTime() : 0;
    // SUMMARY may carry ICS parameters (e.g. a LANGUAGE tag), in which case
    // node-ical hands back { val, params } instead of a plain string.
    const title = (typeof entry.summary === "string" ? entry.summary : entry.summary?.val) || "Untitled";
    const uid = entry.uid ?? key;

    const occurrenceStarts = entry.rrule
      ? entry.rrule.between(rangeStart, rangeEnd, true)
      : entry.start < rangeEnd && (entry.end ?? entry.start) > rangeStart
        ? [entry.start]
        : [];

    for (const start of occurrenceStarts) {
      const end = new Date(start.getTime() + durationMs);
      const dateISO = allDay ? toISODate(start) : localDateISO(start, settings.timeZone);
      const timeLabel = allDay ? null : localTimeLabel(start, settings.timeZone);
      events.push({ id: `${uid}-${start.toISOString()}`, title, start, end, allDay, dateISO, timeLabel });
    }
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}
