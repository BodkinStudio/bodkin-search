import { describe, it, expect } from "vitest";
import { calendarWindow, calendarDay, calendarMidnight } from "./calendar";
describe("analytics calendar periods", () => {
  it("uses23-hour spring and25-hour autumn local days", () => {
    expect(
      calendarWindow(1, "Europe/London", new Date("2026-03-29T12:00:00Z")),
    ).toEqual({
      from: "2026-03-29T00:00:00.000Z",
      to: "2026-03-29T22:59:59.999Z",
    });
    expect(
      calendarWindow(1, "Europe/London", new Date("2026-10-25T12:00:00Z")),
    ).toEqual({
      from: "2026-10-24T23:00:00.000Z",
      to: "2026-10-25T23:59:59.999Z",
    });
  });
  it("keeps adjacent comparison calendar days contiguous across DST", () => {
    const now = new Date("2026-03-30T12:00:00Z");
    const current = calendarWindow(7, "Europe/London", now);
    const previous = calendarWindow(7, "Europe/London", now, true);
    expect(Date.parse(previous.to) + 1).toBe(Date.parse(current.from));
  });
  it("supports fractional timezone offsets and date boundaries", () => {
    expect(calendarMidnight("2026-09-15", "Asia/Kathmandu")).toBe(
      "2026-09-14T18:15:00.000Z",
    );
    expect(calendarDay("2026-09-15T01:00:00Z", "America/Los_Angeles")).toBe(
      "2026-09-14",
    );
  });
});
