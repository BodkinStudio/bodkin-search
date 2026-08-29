import { describe, expect, it } from "vitest";
import {
  GROWTH_SETTINGS_DEFAULTS,
  growthSettingsInputSchema,
  updateGrowthSettingsSchema,
} from "./growth";

describe("growth settings schemas", () => {
  it("accepts the documented defaults", () => {
    expect(growthSettingsInputSchema.parse(GROWTH_SETTINGS_DEFAULTS)).toEqual(
      GROWTH_SETTINGS_DEFAULTS,
    );
  });

  it("accepts weekly ISO weekdays and a disabled long window", () => {
    expect(
      updateGrowthSettingsSchema.parse({
        projectId: "project_1",
        ...GROWTH_SETTINGS_DEFAULTS,
        reportCadence: "weekly",
        reportDay: 7,
        defaultLongWindowDays: null,
      }),
    ).toMatchObject({
      reportCadence: "weekly",
      reportDay: 7,
      defaultLongWindowDays: null,
    });
  });

  it("rejects a weekly day outside the ISO weekday range", () => {
    expect(() =>
      growthSettingsInputSchema.parse({
        ...GROWTH_SETTINGS_DEFAULTS,
        reportCadence: "weekly",
        reportDay: 8,
      }),
    ).toThrow("Weekly report day must be an ISO weekday from 1 to 7");
  });

  it("rejects an invalid timezone", () => {
    expect(() =>
      growthSettingsInputSchema.parse({
        ...GROWTH_SETTINGS_DEFAULTS,
        reportTimezone: "Mars/Olympus_Mons",
      }),
    ).toThrow("Use a valid IANA timezone");
  });

  it("rejects measurement windows outside their bounds", () => {
    expect(() =>
      growthSettingsInputSchema.parse({
        ...GROWTH_SETTINGS_DEFAULTS,
        defaultCooldownDays: 366,
      }),
    ).toThrow();
    expect(() =>
      growthSettingsInputSchema.parse({
        ...GROWTH_SETTINGS_DEFAULTS,
        defaultLongWindowDays: 0,
      }),
    ).toThrow();
  });
});
