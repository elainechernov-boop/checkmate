import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { parseISODate } from "./dates";
import {
  assignCalendarEvent,
  fetchFamilyCalendarEvents,
  getCalendarEventAssignments,
  unassignCalendarEvent,
  type FamilyCalendarSettingsData,
} from "./familyCalendar";
import { makeStudent } from "./test/fixtures";
import { createTestClient, resetDb } from "./test/testDb";

const SETTINGS: FamilyCalendarSettingsData = {
  icsUrl: "https://calendar.google.com/calendar/ical/test/basic.ics",
  timeZone: "America/Los_Angeles",
};

function mockFetch(body: string, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 404,
      text: async () => body,
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchFamilyCalendarEvents", () => {
  it("returns a plain timed event within range, bucketed by the family's own timezone", async () => {
    // 4pm UTC = 9am Pacific — should land on the same calendar day both ways.
    mockFetch(`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:dentist@test
DTSTART:20260825T160000Z
DTEND:20260825T170000Z
SUMMARY:Dentist appointment
END:VEVENT
END:VCALENDAR
`);

    const events = await fetchFamilyCalendarEvents(SETTINGS, parseISODate("2026-08-24"), parseISODate("2026-08-31"));

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Dentist appointment");
    expect(events[0].allDay).toBe(false);
    expect(events[0].dateISO).toBe("2026-08-25");
    expect(events[0].timeLabel).toBe("9:00 AM");
  });

  it("buckets a late-evening event onto its Pacific-time day, not its UTC day", async () => {
    // 9pm Pacific on the 25th is 4am UTC on the 26th — a naive UTC bucket
    // would misfile this onto the wrong day.
    mockFetch(`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:dinner@test
DTSTART:20260826T040000Z
DTEND:20260826T050000Z
SUMMARY:Family dinner
END:VEVENT
END:VCALENDAR
`);

    const events = await fetchFamilyCalendarEvents(SETTINGS, parseISODate("2026-08-24"), parseISODate("2026-08-31"));

    expect(events).toHaveLength(1);
    expect(events[0].dateISO).toBe("2026-08-25"); // Pacific day, not the UTC day (26th)
  });

  it("expands a weekly recurring event to every occurrence in range", async () => {
    mockFetch(`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:soccer@test
DTSTART:20260824T203000Z
DTEND:20260824T213000Z
RRULE:FREQ=WEEKLY;BYDAY=MO
SUMMARY:Soccer practice
END:VEVENT
END:VCALENDAR
`);

    const events = await fetchFamilyCalendarEvents(SETTINGS, parseISODate("2026-08-24"), parseISODate("2026-09-14"));

    expect(events).toHaveLength(3); // Aug 24, 31, Sep 7 — three Mondays
    expect(events.every((e) => e.title === "Soccer practice")).toBe(true);
    expect(events.map((e) => e.dateISO)).toEqual(["2026-08-24", "2026-08-31", "2026-09-07"]);
  });

  it("keeps an all-day event on its plain calendar date", async () => {
    mockFetch(`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:closed@test
DTSTART;VALUE=DATE:20260827
DTEND;VALUE=DATE:20260828
SUMMARY:School closed
END:VEVENT
END:VCALENDAR
`);

    const events = await fetchFamilyCalendarEvents(SETTINGS, parseISODate("2026-08-24"), parseISODate("2026-08-31"));

    expect(events).toHaveLength(1);
    expect(events[0].allDay).toBe(true);
    expect(events[0].dateISO).toBe("2026-08-27");
    expect(events[0].timeLabel).toBeNull();
  });

  it("excludes events entirely outside the requested range", async () => {
    mockFetch(`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:next-month@test
DTSTART:20260930T160000Z
DTEND:20260930T170000Z
SUMMARY:Next month
END:VEVENT
END:VCALENDAR
`);

    const events = await fetchFamilyCalendarEvents(SETTINGS, parseISODate("2026-08-24"), parseISODate("2026-08-31"));

    expect(events).toHaveLength(0);
  });

  it("returns an empty list rather than throwing when the fetch fails", async () => {
    mockFetch("", false);

    const events = await fetchFamilyCalendarEvents(SETTINGS, parseISODate("2026-08-24"), parseISODate("2026-08-31"));

    expect(events).toEqual([]);
  });

  it("returns an empty list rather than throwing on a malformed feed", async () => {
    mockFetch("not an ics file at all");

    const events = await fetchFamilyCalendarEvents(SETTINGS, parseISODate("2026-08-24"), parseISODate("2026-08-31"));

    expect(events).toEqual([]);
  });
});

describe("calendar event assignment", () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    prisma = createTestClient();
    await resetDb(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("assigns an event to a student, and it shows up in getCalendarEventAssignments", async () => {
    const student = await makeStudent(prisma);
    await assignCalendarEvent(prisma, "event-1", student.id);

    const assignments = await getCalendarEventAssignments(prisma);
    expect(assignments).toEqual([{ eventKey: "event-1", studentId: student.id }]);
  });

  it("assigning the same event to the same student twice is a no-op, not an error", async () => {
    const student = await makeStudent(prisma);
    await assignCalendarEvent(prisma, "event-1", student.id);
    await assignCalendarEvent(prisma, "event-1", student.id);

    const assignments = await getCalendarEventAssignments(prisma);
    expect(assignments).toHaveLength(1);
  });

  it("the same event can be assigned to more than one student", async () => {
    const miles = await makeStudent(prisma, { name: "Miles" });
    const violet = await makeStudent(prisma, { name: "Violet" });
    await assignCalendarEvent(prisma, "event-1", miles.id);
    await assignCalendarEvent(prisma, "event-1", violet.id);

    const assignments = await getCalendarEventAssignments(prisma);
    expect(assignments).toHaveLength(2);
  });

  it("unassigning removes just that student's assignment, not the other student's", async () => {
    const miles = await makeStudent(prisma, { name: "Miles" });
    const violet = await makeStudent(prisma, { name: "Violet" });
    await assignCalendarEvent(prisma, "event-1", miles.id);
    await assignCalendarEvent(prisma, "event-1", violet.id);

    await unassignCalendarEvent(prisma, "event-1", miles.id);

    const assignments = await getCalendarEventAssignments(prisma);
    expect(assignments).toEqual([{ eventKey: "event-1", studentId: violet.id }]);
  });

  it("unassigning a never-assigned event is a no-op, not an error", async () => {
    const student = await makeStudent(prisma);
    await expect(unassignCalendarEvent(prisma, "never-assigned", student.id)).resolves.not.toThrow();
  });
});
