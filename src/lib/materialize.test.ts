import { describe, expect, it } from "vitest";
import { EndCondition, Frequency } from "@/generated/prisma/enums";
import { addDays, parseISODate, toISODate } from "./dates";
import { computeOccurrenceDates, type SeriesOccurrenceInput } from "./materialize";

function isoList(dates: Date[]): string[] {
  return dates.map(toISODate);
}

function blockedOn(...isoDates: string[]) {
  const blocked = new Set(isoDates);
  return (date: Date) => blocked.has(toISODate(date));
}

describe("computeOccurrenceDates", () => {
  it("skips forward over a single offDay for a weekdays series", () => {
    // Mon Aug 3 - Fri Aug 7, 2026. Wednesday the 5th is an offDay.
    const series: SeriesOccurrenceInput = {
      startDate: parseISODate("2026-08-03"),
      recurrence: { frequency: Frequency.weekdays, daysOfWeek: null, interval: 1 },
      endCondition: EndCondition.never,
      endDate: null,
      endCount: null,
    };
    const isBlocked = blockedOn("2026-08-05");
    const horizonEnd = parseISODate("2026-08-07");

    const dates = isoList(computeOccurrenceDates(series, isBlocked, horizonEnd));

    // The 5th is skipped outright — no occurrence shifts onto it, and
    // nothing doubles up on an adjacent day either.
    expect(dates).toEqual(["2026-08-03", "2026-08-04", "2026-08-06", "2026-08-07"]);
  });

  it("does not generate a weekdays occurrence on a weekend", () => {
    const series: SeriesOccurrenceInput = {
      startDate: parseISODate("2026-08-07"), // Friday
      recurrence: { frequency: Frequency.weekdays, daysOfWeek: null, interval: 1 },
      endCondition: EndCondition.never,
      endDate: null,
      endCount: null,
    };
    const isBlocked = () => false;
    const horizonEnd = parseISODate("2026-08-10"); // Monday

    const dates = isoList(computeOccurrenceDates(series, isBlocked, horizonEnd));

    expect(dates).toEqual(["2026-08-07", "2026-08-10"]); // Sat/Sun skipped, not shifted-into
  });

  it("a daily series (§7's 'Every day') includes Saturday but never Sunday — the week view has no Sunday column", () => {
    const series: SeriesOccurrenceInput = {
      startDate: parseISODate("2026-08-07"), // Friday
      recurrence: { frequency: Frequency.daily, daysOfWeek: null, interval: 1 },
      endCondition: EndCondition.never,
      endDate: null,
      endCount: null,
    };
    const isBlocked = () => false;
    const horizonEnd = parseISODate("2026-08-10"); // Monday

    const dates = isoList(computeOccurrenceDates(series, isBlocked, horizonEnd));

    expect(dates).toEqual(["2026-08-07", "2026-08-08", "2026-08-10"]); // Sat included, Sun skipped
  });

  it("an every-other-day series that would land on a Sunday shifts to Monday instead, then resumes its stride from there", () => {
    const series: SeriesOccurrenceInput = {
      startDate: parseISODate("2026-08-07"), // Friday
      recurrence: { frequency: Frequency.daily, daysOfWeek: null, interval: 2 },
      endCondition: EndCondition.never,
      endDate: null,
      endCount: null,
    };
    const isBlocked = () => false;
    const horizonEnd = parseISODate("2026-08-14"); // the following Friday

    const dates = isoList(computeOccurrenceDates(series, isBlocked, horizonEnd));

    // Fri 7, then +2 would land on Sun 9 — not a candidate day, so it
    // shifts forward one day to Mon 10 and strides by 2 again from there.
    expect(dates).toEqual(["2026-08-07", "2026-08-10", "2026-08-12", "2026-08-14"]);
  });

  it("omits a field-trip Tuesday from a weekly Tue/Thu series instead of shifting it", () => {
    // Tue Aug 4 is a field trip; Thu Aug 6 is a normal school day.
    const series: SeriesOccurrenceInput = {
      startDate: parseISODate("2026-08-03"), // Monday
      recurrence: { frequency: Frequency.weekly, daysOfWeek: ["tue", "thu"], interval: 1 },
      endCondition: EndCondition.never,
      endDate: null,
      endCount: null,
    };
    const isBlocked = blockedOn("2026-08-04");
    const horizonEnd = parseISODate("2026-08-13"); // through the following Thursday

    const dates = isoList(computeOccurrenceDates(series, isBlocked, horizonEnd));

    // No Tuesday Aug 4 occurrence, and it does NOT reappear on Wednesday —
    // the next week's Tue/Thu still fire normally.
    expect(dates).toEqual(["2026-08-06", "2026-08-11", "2026-08-13"]);
  });

  it("respects a biweekly interval", () => {
    const series: SeriesOccurrenceInput = {
      startDate: parseISODate("2026-08-03"), // Monday
      recurrence: { frequency: Frequency.biweekly, daysOfWeek: ["mon"], interval: 2 },
      endCondition: EndCondition.never,
      endDate: null,
      endCount: null,
    };
    const isBlocked = () => false;
    const horizonEnd = parseISODate("2026-09-15");

    const dates = isoList(computeOccurrenceDates(series, isBlocked, horizonEnd));

    expect(dates).toEqual(["2026-08-03", "2026-08-17", "2026-08-31", "2026-09-14"]);
  });

  it("stops generating after the onDate end condition", () => {
    const series: SeriesOccurrenceInput = {
      startDate: parseISODate("2026-08-03"),
      recurrence: { frequency: Frequency.weekdays, daysOfWeek: null, interval: 1 },
      endCondition: EndCondition.onDate,
      endDate: parseISODate("2026-08-05"),
      endCount: null,
    };
    const isBlocked = () => false;
    const horizonEnd = parseISODate("2026-08-14");

    const dates = isoList(computeOccurrenceDates(series, isBlocked, horizonEnd));

    expect(dates).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
  });

  it("stops after N occurrences under afterNCount, without counting omitted ones", () => {
    // Weekly Tuesday series where the 2nd Tuesday is a field trip — it
    // should not count toward the 3 required occurrences.
    const series: SeriesOccurrenceInput = {
      startDate: parseISODate("2026-08-03"), // Monday
      recurrence: { frequency: Frequency.weekly, daysOfWeek: ["tue"], interval: 1 },
      endCondition: EndCondition.afterNCount,
      endDate: null,
      endCount: 3,
    };
    const isBlocked = blockedOn("2026-08-11"); // second Tuesday
    const horizonEnd = addDays(parseISODate("2026-08-03"), 60);

    const dates = isoList(computeOccurrenceDates(series, isBlocked, horizonEnd));

    expect(dates).toEqual(["2026-08-04", "2026-08-18", "2026-08-25"]);
    expect(dates).toHaveLength(3);
  });

  it("treats a one-off (no recurrence) due date as blocked-or-not, no shifting", () => {
    const series: SeriesOccurrenceInput = {
      startDate: parseISODate("2026-08-05"),
      recurrence: null,
      endCondition: EndCondition.never,
      endDate: null,
      endCount: null,
    };
    const horizonEnd = parseISODate("2026-08-10");

    expect(isoList(computeOccurrenceDates(series, () => false, horizonEnd))).toEqual(["2026-08-05"]);
    expect(isoList(computeOccurrenceDates(series, () => true, horizonEnd))).toEqual([]);
  });

  it("clamps a monthly series' day-of-month at short months", () => {
    const series: SeriesOccurrenceInput = {
      startDate: parseISODate("2026-01-31"),
      recurrence: { frequency: Frequency.monthly, daysOfWeek: null, interval: 1 },
      endCondition: EndCondition.never,
      endDate: null,
      endCount: null,
    };
    const horizonEnd = parseISODate("2026-04-30");

    const dates = isoList(computeOccurrenceDates(series, () => false, horizonEnd));

    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
});
