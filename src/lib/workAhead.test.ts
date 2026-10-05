import { describe, expect, it } from "vitest";
import { parseISODate, toISODate } from "./dates";
import { canWorkOn, workAheadDate } from "./workAhead";

const SUNDAY = parseISODate("2026-10-04");
const FRIDAY = parseISODate("2026-10-02");
const SATURDAY = parseISODate("2026-10-03");

describe("working ahead on a Sunday (§15)", () => {
  it("opens up Monday on a Sunday, and nothing on any other day", () => {
    expect(toISODate(workAheadDate(SUNDAY)!)).toBe("2026-10-05");
    for (const day of ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"]) {
      expect(workAheadDate(parseISODate(day))).toBeNull();
    }
  });

  it("lets today's own tasks through on any day", () => {
    expect(canWorkOn(FRIDAY, FRIDAY)).toBe(true);
    expect(canWorkOn(SUNDAY, SUNDAY)).toBe(true);
  });

  it("on a Sunday, lets tomorrow's (Monday's) tasks through — and no later day's", () => {
    expect(canWorkOn(parseISODate("2026-10-05"), SUNDAY)).toBe(true);
    expect(canWorkOn(parseISODate("2026-10-06"), SUNDAY)).toBe(false);
    expect(canWorkOn(parseISODate("2026-10-11"), SUNDAY)).toBe(false);
  });

  it("never lets tomorrow's tasks through on a weekday — Friday and Saturday stay today-only", () => {
    expect(canWorkOn(SATURDAY, FRIDAY)).toBe(false);
    expect(canWorkOn(parseISODate("2026-10-05"), SATURDAY)).toBe(false);
  });

  it("never lets yesterday's, or an undated backlog task, through", () => {
    expect(canWorkOn(SATURDAY, SUNDAY)).toBe(false);
    expect(canWorkOn(null, SUNDAY)).toBe(false);
  });
});
