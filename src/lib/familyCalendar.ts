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
