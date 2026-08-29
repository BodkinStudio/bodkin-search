import { beforeEach, describe, expect, it, vi } from "vitest";
import { GROWTH_SETTINGS_DEFAULTS } from "@/types/schemas/growth";
import { getSettings, updateSettings } from "./GrowthSettingsService";

const mocks = vi.hoisted(() => ({
  getByProjectId: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock(
  "@/server/features/growth/repositories/GrowthSettingsRepository",
  () => ({ GrowthSettingsRepository: mocks }),
);

const persistedRow = {
  projectId: "project_1",
  ...GROWTH_SETTINGS_DEFAULTS,
  createdAt: "2026-08-29T10:00:00.000Z",
  updatedAt: "2026-08-29T10:00:00.000Z",
};

describe("GrowthSettingsService", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue(persistedRow);
  });

  it("returns deterministic defaults before settings are persisted", async () => {
    await expect(getSettings("project_1")).resolves.toEqual({
      projectId: "project_1",
      ...GROWTH_SETTINGS_DEFAULTS,
      createdAt: null,
      updatedAt: null,
      persisted: false,
    });
  });

  it("returns a stored project row without merging another project's state", async () => {
    mocks.getByProjectId.mockResolvedValue(persistedRow);

    await expect(getSettings("project_1")).resolves.toEqual({
      ...persistedRow,
      persisted: true,
    });
    expect(mocks.getByProjectId).toHaveBeenCalledWith("project_1");
  });

  it("requires a primary domain before enabling Growth", async () => {
    await expect(
      updateSettings(
        { projectId: "project_1", projectDomain: null },
        { ...GROWTH_SETTINGS_DEFAULTS, growthEnabled: true },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("allows disabled settings before a project domain is known", async () => {
    await updateSettings(
      { projectId: "project_1", projectDomain: null },
      GROWTH_SETTINGS_DEFAULTS,
    );

    expect(mocks.upsert).toHaveBeenCalledWith(
      "project_1",
      GROWTH_SETTINGS_DEFAULTS,
    );
  });

  it("persists enabled settings for the authorized project scope", async () => {
    const input = { ...GROWTH_SETTINGS_DEFAULTS, growthEnabled: true };

    await expect(
      updateSettings(
        { projectId: "project_1", projectDomain: "acme.com" },
        input,
      ),
    ).resolves.toEqual({ ...persistedRow, persisted: true });
    expect(mocks.upsert).toHaveBeenCalledWith("project_1", input);
  });
});
