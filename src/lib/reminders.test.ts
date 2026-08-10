import { describe, expect, it } from "vitest";
import { InstanceStatus } from "@/generated/prisma/enums";
import { formatScheduledTime, isReminderDue, type ReminderCandidate } from "./reminders";

function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    id: "i1",
    status: InstanceStatus.open,
    isTimeSensitive: true,
    scheduledTime: "15:00",
    reminderMinutesBefore: 10,
    ...overrides,
  };
}

// Local wall-clock time on an arbitrary day — isReminderDue only ever reads
// hours/minutes off both `now` and the parsed scheduledTime, so the exact
// calendar date doesn't matter as long as it's consistent.
function at(hour: number, minute: number): Date {
  return new Date(2026, 7, 10, hour, minute, 0, 0);
}

describe("isReminderDue", () => {
  it("is false before the reminder window opens", () => {
    expect(isReminderDue(candidate(), at(14, 49))).toBe(false);
  });

  it("is true the moment the reminder window opens (10 min before a 3:00 class)", () => {
    expect(isReminderDue(candidate(), at(14, 50))).toBe(true);
  });

  it("stays true right up through the scheduled start time", () => {
    expect(isReminderDue(candidate(), at(15, 0))).toBe(true);
  });

  it("stays true through the 15-minute grace period after start, for a late-opened tab", () => {
    expect(isReminderDue(candidate(), at(15, 15))).toBe(true);
  });

  it("is false once the grace period has fully expired", () => {
    expect(isReminderDue(candidate(), at(15, 16))).toBe(false);
  });

  it("is false for an assignment that isn't marked time-sensitive", () => {
    expect(isReminderDue(candidate({ isTimeSensitive: false }), at(14, 55))).toBe(false);
  });

  it("is false once the item is no longer open (done, pendingReview, or excused)", () => {
    expect(isReminderDue(candidate({ status: InstanceStatus.done }), at(14, 55))).toBe(false);
    expect(isReminderDue(candidate({ status: InstanceStatus.pendingReview }), at(14, 55))).toBe(false);
    expect(isReminderDue(candidate({ status: InstanceStatus.excused }), at(14, 55))).toBe(false);
  });

  it("is false when scheduledTime or reminderMinutesBefore is missing", () => {
    expect(isReminderDue(candidate({ scheduledTime: null }), at(14, 55))).toBe(false);
    expect(isReminderDue(candidate({ reminderMinutesBefore: null }), at(14, 55))).toBe(false);
  });
});

describe("formatScheduledTime", () => {
  it("formats an afternoon time", () => {
    expect(formatScheduledTime("15:00")).toBe("3:00 PM");
  });

  it("formats a morning time", () => {
    expect(formatScheduledTime("09:05")).toBe("9:05 AM");
  });

  it("formats noon and midnight correctly", () => {
    expect(formatScheduledTime("12:00")).toBe("12:00 PM");
    expect(formatScheduledTime("00:00")).toBe("12:00 AM");
  });
});
