# Final acceptance probes

The fresh acceptance audit identified missing runtime evidence, not an implementation defect: raw database length rejection and service-level foreign-source/concurrent-publication behavior. With the two implementation repair rounds exhausted, no further application repair was made. The Director executed these evidence-only probes against temporary copies of the existing in-memory fixtures. All passed; production source and the approved implementation diff are unchanged.

## Command and result

```text
pnpm exec vitest run src/server/features/growth/repositories/GrowthReportsRepository.acceptance-probe.test.ts src/server/features/growth/services/GrowthSignalToReport.acceptance-probe.test.ts --maxWorkers=1 --reporter=verbose

Test Files  2 passed (2)
Tests       2 passed (2)
Duration    1.37s
```

The temporary copies use the existing migration/service setup unchanged, with only the following assertions inserted. The copies are removed after final audit; these exact probe definitions are retained for reproduction.

## Raw database limits

Inserted into `GrowthReportsRepository.migration.test.ts` immediately before the Action-deletion assertions. The header probe uses a fresh family version so a uniqueness constraint cannot produce a false positive. The valid-JSON section probe exceeds the UTF-8 byte limit and checks the exact database constraint name.

```ts
await expect(insertReport({ id: "x".repeat(101), version: 2 })).rejects.toThrow(
  /growth_reports_text_bounds_check/,
);
const oversizedContent = JSON.stringify({
  summary: "😀".repeat(17_000),
  items: [],
});
expect(new TextEncoder().encode(oversizedContent).byteLength).toBeGreaterThan(
  65_536,
);
await expect(
  client.execute({
    sql: "INSERT INTO growth_report_sections (id, project_id, report_id, section_type, position, structured_content) VALUES (?, ?, ?, ?, ?, ?)",
    args: [
      "oversized_section",
      "project_1",
      "report_1",
      "performance",
      1,
      oversizedContent,
    ],
  }),
).rejects.toThrow(/growth_report_sections_text_bounds_check/);
expect(await countRows("growth_reports")).toBe(1);
expect(await countRows("growth_report_sections")).toBe(1);
```

## Foreign sources through the service

Inserted into `GrowthSignalToReport.test.ts` before initial Report creation. The foreign project exists; Action-only and Result-only source requests separately fail through `GrowthReportsService` and leave no header.

```ts
await client.execute(
  "INSERT INTO projects (id, domain) VALUES ('phase1_foreign', 'foreign.example')",
);
const foreignRequest = { ...reportRequest, projectId: "phase1_foreign" };
await expect(
  reports.createGrowthReport(foreignRequest, {
    now: new Date(`${addDays(measurementEnd, 2)}T12:00:00.000Z`),
  }),
).rejects.toMatchObject({ code: "NOT_FOUND" });
const foreignActionSections = reportSections(action.action.id, resultId).map(
  (section) => ({
    ...section,
    content: {
      ...section.content,
      items: section.content.items.map((item) => ({
        ...item,
        source: item.source?.type === "measurement_result" ? null : item.source,
      })),
    },
  }),
);
await expect(
  reports.createGrowthReport(
    { ...foreignRequest, sections: foreignActionSections },
    { now: new Date(`${addDays(measurementEnd, 2)}T12:00:00.000Z`) },
  ),
).rejects.toMatchObject({ code: "NOT_FOUND" });
expect(
  (
    await client.execute(
      "SELECT id FROM growth_reports WHERE project_id = 'phase1_foreign'",
    )
  ).rows,
).toEqual([]);
```

## Concurrent service publication

Inserted into `GrowthSignalToReport.test.ts` before the prunable-draft scenario. Two service calls use different publisher identities and times; both return the same first committed projection, also confirmed by a subsequent service read.

```ts
const raceReport = await reports.createGrowthReport(
  { ...reportRequest, version: 3 },
  { now: new Date(`${addDays(measurementEnd, 4)}T13:00:00.000Z`) },
);
const [raceFirst, raceSecond] = await Promise.all([
  reports.publishGrowthReport(
    {
      projectId: "phase1_project",
      reportId: raceReport.id,
      actorType: "user",
      actorId: "first-publisher",
    },
    { now: new Date(`${addDays(measurementEnd, 5)}T12:00:00.000Z`) },
  ),
  reports.publishGrowthReport(
    {
      projectId: "phase1_project",
      reportId: raceReport.id,
      actorType: "agent",
      actorId: "second-publisher",
    },
    { now: new Date(`${addDays(measurementEnd, 6)}T12:00:00.000Z`) },
  ),
]);
expect(raceFirst.status).toBe("published");
expect(raceSecond).toMatchObject({
  status: "published",
  publishedAt: raceFirst.publishedAt,
  publishedByType: raceFirst.publishedByType,
  publishedById: raceFirst.publishedById,
});
expect(
  await reports.getGrowthReport("phase1_project", raceReport.id),
).toMatchObject({
  publishedAt: raceFirst.publishedAt,
  publishedByType: raceFirst.publishedByType,
  publishedById: raceFirst.publishedById,
});
```
