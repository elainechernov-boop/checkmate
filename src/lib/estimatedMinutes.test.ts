import { describe, expect, it } from "vitest";
import { InstanceStatus } from "@/generated/prisma/enums";
import {
  DEFAULT_ESTIMATED_MINUTES,
  formatTotalMinutes,
  minutesProgress,
  sumEstimatedMinutes,
  type MinutesCandidate,
} from "./estimatedMinutes";

function candidate(overrides: Partial<MinutesCandidate> = {}): MinutesCandidate {
  return { estimatedMinutes: 30, series: null, status: InstanceStatus.open, ...overrides };
}

describe("formatTotalMinutes", () => {
  it("formats under an hour as plain minutes", () => {
    expect(formatTotalMinutes(45)).toBe("45 min");
  });

  it("formats an even hour with no minutes remainder", () => {
    expect(formatTotalMinutes(120)).toBe("2h");
  });

  it("formats a mixed hour + minutes total", () => {
    expect(formatTotalMinutes(90)).toBe("1h 30m");
  });
});

describe("sumEstimatedMinutes", () => {
  it("sums real estimates from the instance or its series", () => {
    const total = sumEstimatedMinutes([
      candidate({ estimatedMinutes: 20 }),
      candidate({ estimatedMinutes: null, series: { estimatedMinutes: 40 } }),
    ]);
    expect(total).toBe(60);
  });

  it("falls back to the default for a task with no estimate anywhere", () => {
    const total = sumEstimatedMinutes([candidate({ estimatedMinutes: null, series: null })]);
    expect(total).toBe(DEFAULT_ESTIMATED_MINUTES);
  });
});

describe("minutesProgress", () => {
  it("counts done/pendingReview/excused as progress, open as not", () => {
    const { done, total } = minutesProgress([
      candidate({ estimatedMinutes: 30, status: InstanceStatus.done }),
      candidate({ estimatedMinutes: 20, status: InstanceStatus.pendingReview }),
      candidate({ estimatedMinutes: 10, status: InstanceStatus.excused }),
      candidate({ estimatedMinutes: 40, status: InstanceStatus.open }),
    ]);
    expect(total).toBe(100);
    expect(done).toBe(60);
  });

  it("is 0/0 for an empty day, not NaN", () => {
    expect(minutesProgress([])).toEqual({ done: 0, total: 0 });
  });
});
