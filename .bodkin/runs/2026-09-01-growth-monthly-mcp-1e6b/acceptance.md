# Required behaviour

1. The existing OpenSEO MCP exposes exactly one new tool named
   `growth_get_monthly_summary`; no second MCP server or transport is created.
2. The tool has one semantic input, `projectId`, and canonical MCP project auth
   validates the caller's organization/project before any Growth read.
3. An authorized call invokes only
   `GrowthMonthlyReportsService.getGrowthMonthlyReport(projectId)`. It never
   builds, publishes, regenerates, mutates, schedules or calls a provider.
4. The tool is annotated read-only, closed-world and non-destructive. Its
   description says it uses no credits, reads the current monthly state, and
   never builds or publishes.
5. Structured output is `{ summary, meta? }`, where `summary` validates against
   the strict existing monthly DTO. Ready, no-activity, Draft and Published
   lifecycle shapes remain truthful; internal IDs, sources, evidence, actors,
   hashes and builder internals remain absent.
6. Human text identifies the reporting period/timezone/state. Saved reports
   include the eight sections in stored order and every bounded item title,
   summary and scalar fact. Published text includes its publication timestamp;
   Draft text does not imply publication.
7. Project metadata contains the authorized project ID and the canonical Growth
   monthly-summary deep link.
8. The tool is registered through the existing MCP registration helper, so
   instrumentation and declared output validation are retained.
9. SAM mirrors the exact shared definition. Its model-facing input omits
   `projectId`, and execution injects the bound session project server-side.
10. The adapter provides only the current previous-complete-month read. It does
    not add arbitrary history coordinates or any write/share capability.
11. No dependency, schema, migration, repository, provider, billing, auth,
    scope, transport, public route, UI or print change is added.
12. ADR documentation records the current-read, existing-service,
    existing-auth, no-write boundary.

# Required checks

- Tool handler/output tests cover authorization denial, Ready, no-activity,
  Draft and Published states, content ordering/facts, metadata, strict output
  validation and no build/publish call.
- SAM adapter coverage proves project-ID stripping/injection and successful
  execution of the shared handler.
- A no-network, in-process MCP client/server test proves the real existing MCP
  server advertises the tool and can invoke it through `tools/call` with the
  declared schemas.
- Existing monthly service, project-auth and SAM tests pass.
- Focused tests, type checking, `pnpm ci:check`, full tests, production build
  and whitespace checks pass.
- External HTTP transport and headless-consumer probes are explicitly not run
  under the user's no-HTTP constraint; no claim is made that those layers passed.

# Regression constraints

- Existing report read/build/publication and frozen DTO behavior do not change.
- Existing MCP auth, scope, instrumentation, metadata and tool registrations do
  not change except for adding the new shared read tool.
- Existing SAM tools retain their schemas and behavior.
