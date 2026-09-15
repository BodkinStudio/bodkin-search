# BG-0605a — read-only monthly summary MCP adapter

## Objective

Expose the already-frozen structured monthly Growth summary through OpenSEO's
existing MCP server and the in-app SAM tool surface. Reuse the current monthly
service, DTO, MCP authorization, instrumentation and metadata conventions. Add
no separate server, service, auth system, persistence or provider work.

## Scope

1. Add one shared tool definition named `growth_get_monthly_summary` under the
   existing MCP tools directory.
2. Accept only the existing project identifier input. Authorize it with
   `withMcpProjectAuth`, then call only
   `GrowthMonthlyReportsService.getGrowthMonthlyReport(projectId)`.
3. Return a concise useful text representation plus structured content wrapped
   as `{ summary: GrowthMonthlyReportDto, meta? }`. Use the existing strict DTO
   so IDs, actors, evidence, hashes, sources and internal versions cannot cross
   the boundary.
4. Render truthful current read states: Ready, No activity if a compatible
   caller ever supplies it, Draft and Published. A saved report text digest
   includes period, timezone, lifecycle metadata, all eight ordered section
   summaries, item titles/summaries and scalar facts.
5. Annotate the tool as read-only, closed-world and non-destructive. Its
   description says it uses no credits and never builds or publishes.
6. Add the project Growth-page deep link through `buildProjectMeta`.
7. Register the same definition in `createOpenSeoMcpServer` so shared
   instrumentation/output validation remains mandatory.
8. Mirror the same definition into `buildSamMcpTools`. SAM strips the model's
   project ID and injects the session project server-side through the existing
   adapter.
9. Record that this is a current previous-complete-month read adapter. Do not
   broaden it into arbitrary history, build, publication, share or write
   semantics.

## Files

- New: `src/server/mcp/tools/growth-tools.ts`
- New: `src/server/mcp/tools/growth-tools.test.ts`
- New: `src/server/features/sam/samChatGrowthTools.test.ts`
- Update: `src/server/mcp/server.ts`
- Update: `src/server/features/sam/samChatTools.ts`
- Update: `docs/growth/05_ARCHITECTURE_DECISIONS.md`

## Verification

- Tool tests: project authorization before service work; exact read-only
  delegation; Ready/Draft/Published text; all ordered report content and facts;
  declared output-schema validation; deep-link metadata; strict DTO redaction;
  no build/publish/provider work.
- SAM test: the tool is present, the model-facing schema omits `projectId`, and
  execution injects the session project before authorization/service work.
- A no-network, in-process MCP client/server protocol test creates the real
  `createOpenSeoMcpServer`, proves `tools/list` exposes the tool with its
  declared input/output schemas, and invokes it through `tools/call`. No raw
  uninstrumented registration or source-text assertion is accepted.
- Existing monthly report, project auth and SAM tests remain green.
- Run focused tests, type checking, `pnpm ci:check`, full tests, production build
  and `git diff --check`.
- The repository `verify-local-mcp` skill normally also requires raw HTTP and a
  headless external MCP consumer probe. Those steps are prohibited by the
  user's standing no-HTTP constraint. Replace them with in-process handler,
  output-schema, MCP client/server protocol and SAM-consumer tests, and
  disclose that the external HTTP transport/headless-consumer layer was not
  claimed as run.

## Non-goals

- No report build, publish, edit, regenerate, history or share tool.
- No arbitrary period input.
- No new permissions/scopes, API key behavior, MCP transport or MCP server.
- No schema, migration, repository, provider, billing or dependency change.
- No UI or print/PDF change.

## Risks and controls

- **Cross-project access:** canonical MCP project auth must complete before the
  monthly service is called; cover denial with a service no-call assertion.
- **Output privacy:** wrap the existing strict DTO instead of projecting a new
  report shape; validate actual structured output against the declared schema.
- **MCP/SAM drift:** import the exact same definition into both registration
  lists and test SAM's bound-project behavior.
- **Unexpected write/cost:** spy on build/publish and keep the handler dependent
  only on the current read method; describe zero-credit behavior explicitly.
- **Oversized or unusable text:** the persisted monthly report is already
  bounded; render each frozen item once and keep structured data canonical.
