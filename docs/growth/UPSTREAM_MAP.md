# OpenSEO upstream map for Bodkin Growth

**Discovery date:** 29 August 2026
**Local branch:** `main`
**Local, fork and upstream commit:** `c469a48ae90ab58413b198fe3d1ac1aa90a9b070`
**Growth phase:** Phase 0 discovery only

This map replaces planning assumptions with facts from the current fork. It does not propose a second service, database, auth system or MCP server.

## Executive decisions

1. The thin-fork strategy still holds. OpenSEO already supplies the tenancy, provider, history, workflow and MCP substrate Growth needs.
2. Phase 1 must reuse project memory, competitors and key pages. It should not create parallel Growth project, competitor or priority-page models.
3. GA4 is no longer future work. The fork has project connections, reporting services, diagnostics, a GSC/GA4 opportunity scorer and ten registered GA4-related MCP tools.
4. Cloudflare self-hosting with D1 and Access Managed OAuth is the smallest supported prototype deployment. It covers the browser, Google connections and MCP. OpenSEO API keys are hosted-only, so the prototype should use OAuth rather than add another key system.
5. OpenSEO has useful scheduling primitives, not a generic scheduler. Growth still needs its own due-selection, run lock, idempotency and workflow orchestration.
6. The missing product is the operating layer: durable Signals, Recommendations, Actions, Change Events, Measurements and frozen Reports.

## Fork and upstream status

- `BodkinStudio/bodkin-search` is a public fork of [`every-app/open-seo`](https://github.com/every-app/open-seo), created on 29 August 2026.
- Local `main`, `origin/main`, the fork's `main` and upstream `main` are identical at `c469a48` (ahead 0, behind 0).
- Only `origin=https://github.com/BodkinStudio/bodkin-search.git` is configured locally. Add an `upstream` remote before the first Growth implementation branch so upstream comparison is routine.
- The public repository is a mirror of a private development repository. Commit subjects containing PR numbers are not necessarily public PRs; `.github/workflows/pr-preview.yml` and `.agents/skills/openseo-release-notes/SKILL.md` describe that split.
- Public contributor PRs are generally proposals rather than the source of shipped truth. `docs/CONTRIBUTING.md` asks external contributors to open issues instead.

## Prototype deployment decision

Use the supported Cloudflare self-host path for the P0/P1 prototype:

| Concern      | Decision                                                                                                                  | Current evidence                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Application  | Deploy this fork with `pnpm deploy:selfhost --yes`.                                                                       | `docs/SELF_HOSTING_CLOUDFLARE.md`; `package.json`                                                                                      |
| Database     | Use the provisioned D1 database initially.                                                                                | `alchemy.run.ts`; `wrangler.jsonc`; `src/db/provider.ts`                                                                               |
| Browser auth | Use Cloudflare Access and the shared self-host workspace.                                                                 | `src/middleware/ensure-user/cloudflareAccess.ts`; `src/server/auth/delegated-organization.ts`                                          |
| GSC and GA4  | Configure the shared Google OAuth client and `BETTER_AUTH_SECRET`; use the existing self-host OAuth callbacks.            | `docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md`; `docs/SELF_HOSTING_GOOGLE_ANALYTICS.md`; `src/server/features/google/selfHostedOAuth.ts` |
| MCP auth     | Enable Access Managed OAuth and allow the Codex/Sherpa redirect URIs.                                                     | `docs/SELF_HOSTING_CLOUDFLARE_OPERATIONS.md`; `src/server/mcp/transport.ts`                                                            |
| API keys     | Do not add a fork-specific key system. `oseo_` keys are available only with hosted Better Auth. Use Managed OAuth for P0. | `src/lib/auth.ts`; `src/server/mcp/api-key-auth.ts`                                                                                    |
| Postgres     | Defer. The runtime abstraction exists, but standard non-production/self-host Alchemy does not bind Hyperdrive.            | `src/db/pg/client.ts`; `alchemy.run.ts`                                                                                                |

This choice is suitable for an internal, read-first prototype. Before enabling Growth MCP writes or broader agency access, review the unresolved identity model: Cloudflare Access gives multiple staff one shared organization but no OpenSEO membership roles or API keys; hosted mode gives OAuth/API keys but is designed around a private one-user workspace. Do not solve that by adding another auth system.

Docker with `local_noauth` is useful only for private local testing. It has no application authentication and does not emit Worker scheduled events.

## Current implementation

### Organisation and project tenancy

- `projects.organizationId` is a required cascading foreign key. Projects carry domain, market (`locationCode`), language and soft-archive state in both dialects: `src/db/app.schema.ts`, `src/db/pg/app.schema.ts`.
- The canonical access lookup filters by project ID, organization ID and `archivedAt IS NULL`: `src/server/features/projects/repositories/ProjectRepository.ts`.
- `ProjectService.getProjectForOrganization` deliberately returns the same `NOT_FOUND` outcome for missing, archived and foreign projects: `src/server/features/projects/services/projects.ts`.
- Project-aware TanStack middleware resolves the caller, then authorizes the requested project before the handler runs: `src/middleware/ensureUser.ts`, `src/serverFunctions/middleware.ts`.
- Most product data is directly project-owned with cascading foreign keys. Billing and some activation state are organization-owned. GSC and GA4 connections store both project and organization identifiers.
- Arbitrary non-null domains are not unique within an organization; only the active Default/null-domain project has a partial uniqueness rule.

Hosted mode uses Better Auth organizations and memberships, but “one user, one workspace” is an application/billing invariant rather than a database constraint. Cloudflare Access and local delegated modes create/use organizations without membership rows.

### Auth modes

Exactly three modes are defined in `src/lib/auth-mode.ts`. Unset or invalid configuration fails closed to `cloudflare_access`.

| Mode                | Application identity                          | Organization                                                   | MCP path                            |
| ------------------- | --------------------------------------------- | -------------------------------------------------------------- | ----------------------------------- |
| `hosted`            | Better Auth session; email/password or Google | Active organization, then earliest/default membership fallback | Workers OAuth or OpenSEO API key    |
| `cloudflare_access` | Verified `cf-access-jwt-assertion`            | Constant shared workspace                                      | Cloudflare Access JWT/Managed OAuth |
| `local_noauth`      | Fixed `local-admin` / `admin@localhost`       | Fixed delegated organization                                   | No authentication                   |

Relevant implementation:

- Hosted Better Auth, organization and API-key plugins: `src/lib/auth.ts`, `src/lib/auth-config.ts`, `src/lib/auth-options.ts`.
- Hosted identity and default organization resolution: `src/middleware/ensure-user/hosted.ts`, `src/server/auth/default-hosted-organization.ts`.
- Cloudflare JWT issuer/audience/signature/identity validation: `src/middleware/ensure-user/cloudflareAccess.ts`.
- Delegated Cloudflare/local users and organizations: `src/middleware/ensure-user/delegated.ts`, `src/server/auth/delegated-organization.ts`.
- Central identity-mode dispatch: `src/middleware/ensure-user/resolve.ts`.

GSC and GA4 OAuth are provider connections, not additional application-auth modes.

### API keys

- OpenSEO API keys use the `oseo_` prefix and the Better Auth API-key plugin: `src/lib/auth-api-key.ts`, `src/lib/auth.ts`.
- They can be created, listed and revoked only in hosted mode: `src/client/features/settings/ApiKeySettings.tsx`, `src/routes/_app/settings.tsx`.
- Key tables exist in both database dialects: `src/db/better-auth-schema.ts`, `src/db/pg/better-auth-schema.ts`.
- MCP accepts `x-api-key` or `Authorization: Bearer` only when the value begins `oseo_`: `src/server/mcp/api-key-auth.ts`.
- Verification maps the key's user reference to a hosted user and that user's earliest/default organization. It does not create a browser session.
- Keys are user-level, not organization-, project-, tool- or operation-scoped. Every project tool must still authorize its explicit `projectId`.
- API keys do not exist in `cloudflare_access` or `local_noauth` deployments.

### MCP authentication and project authorisation

`src/server.ts` selects the transport:

- hosted requests run through `src/server/mcp/oauth-provider.ts`, which supports authorization, dynamic registration, access/refresh tokens and resource metadata;
- API keys are checked before hosted OAuth transport handling;
- Cloudflare/local self-host requests go directly to `handleSelfHostedOpenSeoMcpRequest` in `src/server/mcp/transport.ts`.

OAuth currently has two scopes, `mcp` and `offline_access`, in `src/lib/oauth-resource.ts`. There are no read/write or per-tool scopes.

Every project tool should use `withMcpProjectAuth` from `src/server/mcp/project-auth.ts`. The guard:

1. requires an explicit `projectId`;
2. loads the project for `context.auth.organizationId`;
3. constructs billing/provider context only after authorization;
4. passes the authorized project to the handler.

`whoami`, `list_projects` and `create_project` are intentionally organization-level. MCP has no ambient active project.

### MCP tool registration conventions

- `createOpenSeoMcpServer` registers 46 tools explicitly in `src/server/mcp/server.ts`.
- Each definition provides a name, metadata, Zod input/output schemas, annotations and a handler.
- `registerOpenSeoTool` normalizes raw Zod shapes/full objects, creates tool context, validates structured output and adds instrumentation: `src/server/mcp/server.ts`, `src/server/mcp/output-schemas.ts`, `src/server/mcp/instrumentation.ts`.
- `mcpResponse` returns human text and structured content with consistent project metadata: `src/server/mcp/formatters.ts`, `src/server/mcp/context.ts`.
- Related tools are often grouped in one file (`google-analytics-tools.ts`, `search-console-tools.ts`, `site-audit-tools.ts`, `project-context.ts`, `local-seo-tools.ts`). The planning pack's “one tool per file” assumption is stale.
- Most project tools call feature services. This is a convention, not an invariant: site-audit MCP handlers currently read `AuditRepository` directly.

Growth should extend this server and reuse its guard, response, instrumentation and schema patterns. Read tools should ship before any Growth write tool.

### Database provider abstraction

- `DATABASE_PROVIDER` accepts `d1` or `postgres`; missing defaults to D1 and invalid values throw: `src/db/provider.ts`.
- D1 uses the global Drizzle client over `env.DB`: `src/db/d1/client.ts`.
- Postgres uses Hyperdrive and request-local `AsyncLocalStorage`; there is no direct runtime connection-string fallback: `src/db/pg/client.ts`.
- `src/db/index.ts` exports a provider-aware `db` and `withPgClient`; `src/db/schema.ts` selects dialect-specific runtime tables behind canonical exports.
- Fetch, cron and Workflow steps explicitly establish Postgres scopes: `src/server.ts`, `src/server/workflows/pgStep.ts`.
- `runBatch` maps an atomic D1 batch to a Postgres transaction and requires statements to be built against its transaction executor: `src/db/runBatch.ts`.
- Postgres retry rules distinguish idempotent reads, writes that failed before execution and non-retried transactions: `src/db/pg/retry.ts`.

### SQLite/D1 and Postgres schema/migration workflow

Schema authoring is deliberately duplicated by dialect:

- SQLite: `src/db/*.schema.ts`, exported by `src/db/d1/schema.ts`.
- Postgres: `src/db/pg/*.schema.ts`, exported by `src/db/pg/schema.ts`.
- D1 migration configuration/output: `drizzle.config.ts`, `drizzle/`.
- Postgres migration configuration/output: `drizzle-pg.config.ts`, `drizzle-pg/`.
- Generate both with `pnpm db:generate`; apply with the dialect-specific scripts in `package.json`.
- Better Auth schemas are generated separately with `pnpm auth:generate`; project-maintained indexes must be restored/reviewed after generation.
- `src/db/schema-parity.test.ts` compares tables, columns, keys, unique/partial constraints, foreign keys and checks, and forbids direct D1 `.batch` use.

Parity tests do not compare ordinary non-unique indexes or prove that generated SQL was committed. Both migration trees must be generated and reviewed for every Growth schema change.

The runtime supports Postgres, but current standard self-host/non-production Alchemy stages provision D1 and do not bind Hyperdrive. `scripts/migrate-d1-to-postgres.ts` is a one-time migration utility, not live replication.

### DataForSEO client and service boundary

The canonical provider flow is:

```text
server function / MCP / workflow
  → feature service
  → createDataforseoClient
  → lazy section fetcher
  → authenticated API factory
  → DataForSEO
```

- Lazy SDK import and metered product client: `src/server/lib/dataforseo/client.ts`.
- Billing envelope and task-status validation: `src/server/lib/dataforseo/envelope.ts`.
- Authenticated HTTP/retry behavior: `src/server/lib/dataforseo/core.ts`.
- Lazy section barrel and exported client surface: `src/server/lib/dataforseo/sections.ts`, `src/server/lib/dataforseo/index.ts`.
- Existing feature boundaries include backlinks (`src/server/features/backlinks/services/`), AI search (`src/server/features/ai-search/services/`), rank workflows (`src/server/workflows/RankCheckWorkflow.ts`) and audit Lighthouse (`src/server/lib/audit/lighthouse.ts`).

Self-hosted calls bypass OpenSEO credit accounting; hosted calls check and record credits. Growth must call existing feature services where possible so it preserves cache, cost and provider-error behavior.

### Google Search Console

Connection and provider boundary:

- One selected property per project is stored in `gsc_connections`; OAuth tokens remain in Better Auth's `account` table: `src/db/gsc.schema.ts`, `src/db/pg/gsc.schema.ts`.
- Repository and service: `src/server/features/gsc/repositories/GscConnectionRepository.ts`, `src/server/features/gsc/services/GscService.ts`.
- REST client and token/error handling: `src/server/lib/gscClient.ts`, `src/server/lib/gscErrors.ts`.
- Hosted provider registration and self-host shared Google flow: `src/lib/auth-config.ts`, `src/server/features/google/selfHostedOAuth.ts`.

Current capabilities:

- property discovery/selection/disconnect;
- live Search Analytics across query/page/country/device/date with filters and pagination;
- batched URL Inspection with per-URL errors;
- browser Search Performance comparisons and striking-distance shaping;
- MCP `get_search_console_performance` and `inspect_urls`.

Relevant paths: `src/serverFunctions/gsc.ts`, `src/serverFunctions/searchPerformance.ts`, `src/server/features/gsc/searchAnalytics.ts`, `src/server/features/gsc/searchPerformanceReport.ts`, `src/server/mcp/tools/search-console-tools.ts`.

GSC results are queried live and not persisted. Growth can reuse `GscService` and pure shaping helpers, but must freeze the minimum evidence needed for later explanation.

### Rank tracking schedules and historical snapshots

- Config, cadence, keywords, runs and snapshots: `src/db/app.schema.ts`, `src/db/pg/app.schema.ts`.
- Schedule/service boundary: `src/server/features/rank-tracking/services/RankTrackingService.ts`.
- Due selection, compare-and-set claim and one-active-run protection: `src/server/features/rank-tracking/repositories/RankTrackingRepository.ts` plus the partial unique index on `rank_check_runs`.
- Five-minute scheduler with task budget/deadline: `src/server/features/rank-tracking/services/scheduledRankChecks.ts`.
- Manual live SERP vs scheduled queued task execution: `src/server/workflows/RankCheckWorkflow.ts`.
- History/current comparison reads: `src/server/features/rank-tracking/repositories/snapshotQueries.ts`, `src/server/features/rank-tracking/services/rankTrackingResults.ts`.
- Browser and MCP exposure: `src/serverFunctions/rank-tracking.ts`, rank-tracking tools under `src/server/mcp/tools/`.

Snapshots are durable and deliberately survive keyword removal. This is the strongest existing canonical history for a Growth detector. Multi-check persistence, materiality and alert suppression are not implemented.

### Backlinks and historical snapshots

- Live/cached provider operations belong to `BacklinksService`: `src/server/features/backlinks/services/BacklinksService.ts`, `backlinksServiceData.ts`.
- Overview includes DataForSEO's prior-year aggregate history where supported; detailed row/domain/page views remain live provider reads.
- `backlink_snapshots` stores dashboard summary counts: `src/db/app.schema.ts`, `src/db/pg/app.schema.ts`.
- The snapshot repository supports only latest and insert: `src/server/features/dashboard/repositories/BacklinkSnapshotRepository.ts`.
- Capture is visit-triggered when the Dashboard sees no snapshot or one older than 24 hours: `src/server/features/dashboard/services/DashboardService.ts`, `src/serverFunctions/dashboard.ts`.

Backlink snapshots therefore exist, but they are not a reliable scheduled time series. Growth can use provider history or freeze a summary during a Growth run; automated longitudinal detection needs an idempotent cadence and range queries.

### Site audit scheduling and data

- Durable audit, page, issue and Lighthouse tables: `src/db/audit.schema.ts`, `src/db/pg/audit.schema.ts`.
- Repository/service: `src/server/features/audit/repositories/AuditRepository.ts`, `src/server/features/audit/services/AuditService.ts`.
- Cloudflare workflow phases: `src/server/workflows/SiteAuditWorkflow.ts`, `src/server/workflows/siteAuditWorkflowPhases.ts`.
- Transient crawl frontier/link graph: `src/server/features/audit/AuditScratchpad.ts`.
- Browser and MCP entry points: `src/serverFunctions/audit.ts`, `src/server/mcp/tools/site-audit-tools.ts`.

Audit runs and results are retained and comparable in principle. Audits are started manually; there is no audit cadence or scheduled audit runner. Cron audit code only reconciles stuck/dead workflows in `src/server/features/audit/services/auditReconciler.ts`. A “new critical issue” detector still needs comparable-run selection, stable matching, cadence and diff semantics.

### AI visibility and Prompt Explorer

Both current surfaces are stateless at the application-database level: `src/types/schemas/ai-search.ts`.

- Brand Lookup calls DataForSEO's ChatGPT/Google AI data, shapes citations/share of voice and caches results in R2 for one day: `src/server/features/ai-search/services/brandLookup.ts`, `brandLookupShaping.ts`, `citedSources.ts`, `shareOfVoice.ts`.
- Prompt Explorer runs one prompt across up to four models and caches each prompt/model tuple for seven days: `src/server/features/ai-search/services/promptExplorer.ts`.
- Paid-plan server functions and UI: `src/serverFunctions/ai-search.ts`, `src/client/features/ai-search/`.
- Search history is browser-local and project-keyed, not durable project data.
- There are no AI visibility MCP tools, persisted prompt sets, scheduled runs or historical observations.

These services can enrich a bounded Growth evidence packet. Longitudinal AI visibility remains separate future work.

### GA4

GA4 is materially implemented now:

- project connection tables in both dialects: `src/db/ga4.schema.ts`, `src/db/pg/ga4.schema.ts`;
- grant/property selection and cleanup: `src/server/features/ga4/services/Ga4Service.ts`;
- provider client and error handling: `src/server/lib/ga4Client.ts`, `src/server/lib/ga4Errors.ts`;
- seven report kinds, normalized date/quota/limited-data behavior and previous-period comparisons: `src/server/features/ga4/services/Ga4ReportDefinitions.ts`, `Ga4ReportingService.ts`, `Ga4ReportNormalization.ts`, `Ga4ReportEnhancements.ts`;
- organic overview and measurement diagnostics: `Ga4OrganicOverviewService.ts`, `Ga4MeasurementHealthService.ts`;
- GSC+GA4 positions 4–20 candidate scoring: `src/server/features/ga4/services/SearchOpportunityService.ts`;
- browser connection/overview: `src/serverFunctions/ga4.ts`, `src/client/features/dashboard/Ga4Card.tsx`;
- ten registered GA4/search-opportunity MCP tools: `src/server/mcp/tools/google-analytics-tools.ts`, `src/server/mcp/server.ts`.

Growth should reuse these services immediately rather than build an analytics provider/OAuth layer. Results are live and report ranges are capped, so reproducible Measurements/Reports still need frozen Growth observations. The current opportunity score is a useful candidate feed, not a replacement for Growth's commercial context, suppression or action history.

### Scheduled, cron and workflow infrastructure

`wrangler.jsonc` declares:

- `RankCheckWorkflow` and `SiteAuditWorkflow` bindings;
- a five-minute cron for due rank checks plus stale-audit reconciliation;
- a daily cron for hosted MCP OAuth KV cleanup;
- Durable Objects for onboarding chat, SAM and audit scratch state.

`src/server.ts` exports the workflow/DO classes and dispatches the cron branches. `alchemy.run.ts` validates and provisions these declarations for Cloudflare stages. `src/server/workflows/pgStep.ts` provides provider-safe database scoping inside Workflow steps.

There is no generic schedule table, job registry or queue abstraction. Growth can reuse the deployment pattern, workflow step style, due-scan/CAS and run-lock techniques, but must add its own binding/class, cadence query, uniqueness and telemetry. Docker currently does not emit scheduled events.

### Report, export and share functionality

Current export support is client-side extraction, not reporting:

- safe CSV construction/download: `src/client/lib/csv.ts`;
- clipboard-to-Google-Sheets handoff: `src/client/lib/exportToSheets.ts`;
- audit, GSC Search Performance, backlinks, rank tracking, keyword/domain and AI-citation exports under their client feature directories;
- Lighthouse JSON/CSV export: `src/server/lib/lighthousePayload.ts`, `src/serverFunctions/lighthouse.ts`.

No database table stores a report, report version, publication or share token. There is no public report route, frozen client view or print-report surface. Authenticated AI/search URLs rerun live queries and are not report snapshots.

### Agent and skill infrastructure

- Repository guidance: `AGENTS.md`.
- `.agents/skills/` is canonical. It currently holds product SEO workflows and internal repository-maintenance skills.
- Nine product skills are copied into `plugins/openseo/skills/` by `scripts/sync-plugin-skills.mjs`; SAM bundles the same nine from `src/server/features/sam/samSkills.ts`.
- Codex, Claude and Cursor marketplace/plugin manifests live under `.agents/plugins/`, `.claude-plugin/`, `.cursor-plugin/` and `plugins/openseo/`.
- All distributed plugin MCP manifests currently target `https://app.openseo.so/mcp`.
- Internal review control is versioned in `.greptile/` and `.github/CODEOWNERS`.

The supplied `AGENTS_BODKIN_APPENDIX.md` has not been appended to root `AGENTS.md`. That is intentional in Phase 0: `AGENTS.md` and related control-plane paths require explicit maintainer review. Growth implementation should either reference or append it in a dedicated reviewed change.

## Relevant upstream issues and PRs

Public GitHub state was checked on 29 August 2026. Open issues/PRs are proposals unless current `main` independently contains the behavior.

| Area                      | Item                                                                                                                      | State and current conclusion                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GA4                       | [Issue #30](https://github.com/every-app/open-seo/issues/30)                                                              | Open, but stale as a capability gap. GA4 shipped independently in commit [`e2c8480`](https://github.com/every-app/open-seo/commit/e2c84803f2ca12e8a18168274dd851c01f7d6062). |
| GA4 self-host             | [PR #202](https://github.com/every-app/open-seo/pull/202)                                                                 | Open and unmerged; alternative implementation only. Main already has GA4 OAuth/report/MCP support.                                                                           |
| GA4 dashboard             | [PR #218](https://github.com/every-app/open-seo/pull/218)                                                                 | Open draft. Expanded visits/conversion/city widgets are not shipped.                                                                                                         |
| Google connection state   | [PR #252](https://github.com/every-app/open-seo/pull/252)                                                                 | Open. Proposed fix for stale “Connected” UI after token failure; not shipped.                                                                                                |
| AI visibility MCP         | [Issue #126](https://github.com/every-app/open-seo/issues/126), [PR #148](https://github.com/every-app/open-seo/pull/148) | Both open. Main has AI UI/services but no AI-search MCP registration.                                                                                                        |
| AI visibility quality     | [Issue #254](https://github.com/every-app/open-seo/issues/254)                                                            | Open. Current Prompt Explorer model aliases remain fixed in `promptExplorer.ts`.                                                                                             |
| Client reports            | [Issue #209](https://github.com/every-app/open-seo/issues/209)                                                            | Open proposal. No durable report/share implementation exists.                                                                                                                |
| Alerts/notifications      | [Issue #208](https://github.com/every-app/open-seo/issues/208)                                                            | Open proposal. Scheduled rank checks log summaries but send no email/webhook alert.                                                                                          |
| Docker scheduling         | [PR #244](https://github.com/every-app/open-seo/pull/244)                                                                 | Open. Proposed authenticated scheduler endpoint is not shipped; Docker has no unattended cron delivery.                                                                      |
| Cloudflare MCP auth       | [Issue #47](https://github.com/every-app/open-seo/issues/47), [PR #48](https://github.com/every-app/open-seo/pull/48)     | Issue completed and PR merged. Managed OAuth/DCR setup is shipped and documented.                                                                                            |
| Alternate MCP auth        | [PR #214](https://github.com/every-app/open-seo/pull/214)                                                                 | Closed unmerged. AgentOnboard session-token auth did not ship.                                                                                                               |
| MCP hardening             | [PR #197](https://github.com/every-app/open-seo/pull/197)                                                                 | Open mixed proposal; not shipped. Do not assume its authz/SSRF behavior.                                                                                                     |
| API-key replay protection | [Issue #233](https://github.com/every-app/open-seo/issues/233), [PR #236](https://github.com/every-app/open-seo/pull/236) | Main masks DOM values independently; the PR's broader network sanitization remains unmerged.                                                                                 |

Current upstream documentation has some drift: `web/content/docs/mcp.md` and the MCP server description do not enumerate the ten GA4-related tools that `src/server/mcp/server.ts` actually registers.

## Growth gap analysis

### Already exists upstream

| Capability                   | Actual current implementation                                                                                     | Relevant source paths                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Organization/project tenancy | Organization-owned, soft-archived projects with canonical org+project authorization.                              | `src/db/app.schema.ts`; `src/server/features/projects/`; `src/middleware/ensureUser.ts`                                |
| Auth modes                   | Hosted Better Auth, Cloudflare Access and local no-auth.                                                          | `src/lib/auth-mode.ts`; `src/lib/auth.ts`; `src/middleware/ensure-user/`                                               |
| Hosted API keys              | User-level `oseo_` MCP credentials with creation/revocation and rate limits.                                      | `src/lib/auth-api-key.ts`; `src/server/mcp/api-key-auth.ts`; `src/client/features/settings/ApiKeySettings.tsx`         |
| MCP server/authz             | OAuth/self-host transports, project guard, schema validation, instrumentation and 46 tools.                       | `src/server/mcp/`; `src/server.ts`                                                                                     |
| Dual database support        | D1 and Postgres Drizzle schemas, runtime provider selection, migrations and parity tests.                         | `src/db/`; `drizzle/`; `drizzle-pg/`; `src/db/schema-parity.test.ts`                                                   |
| Project memory               | Business/goal/positioning prose, normalized competitors, curated key pages and research log shared by UI/SAM/MCP. | `src/db/project-context.schema.ts`; `src/server/features/project-context/`; `src/server/mcp/tools/project-context.ts`  |
| DataForSEO boundary          | Metered/cached client with feature-service wrappers.                                                              | `src/server/lib/dataforseo/`; `src/server/features/`                                                                   |
| GSC                          | OAuth, Search Analytics, URL Inspection, comparison helpers, UI and MCP.                                          | `src/server/features/gsc/`; `src/serverFunctions/searchPerformance.ts`; `src/server/mcp/tools/search-console-tools.ts` |
| Rank history                 | Scheduled/manual checks, durable runs/snapshots and historical queries.                                           | `src/server/features/rank-tracking/`; `src/server/workflows/RankCheckWorkflow.ts`; `src/db/app.schema.ts`              |
| Backlinks                    | Cached live services, provider history and sparse dashboard summary snapshots.                                    | `src/server/features/backlinks/`; `src/server/features/dashboard/repositories/BacklinkSnapshotRepository.ts`           |
| Site audits                  | Durable audit/page/issue history and a Cloudflare Workflow.                                                       | `src/server/features/audit/`; `src/server/workflows/SiteAuditWorkflow.ts`; `src/db/audit.schema.ts`                    |
| AI search services           | Brand/citation/share-of-voice and multi-model Prompt Explorer services with R2 caching.                           | `src/server/features/ai-search/`; `src/serverFunctions/ai-search.ts`                                                   |
| GA4                          | OAuth, reporting, diagnostics, opportunity scoring, browser overview and ten MCP tools.                           | `src/server/features/ga4/`; `src/server/mcp/tools/google-analytics-tools.ts`                                           |
| Workflow deployment patterns | Cron dispatch, Workflow bindings/classes, PG step wrapper, run locking examples.                                  | `wrangler.jsonc`; `src/server.ts`; `src/server/workflows/`; `alchemy.run.ts`                                           |
| Export primitives            | CSV/JSON downloads and clipboard-to-Sheets handoff.                                                               | `src/client/lib/csv.ts`; `src/client/lib/exportToSheets.ts`; client feature exports                                    |
| Skills/plugins               | Canonical skills, SAM bundle and Codex/Claude/Cursor packages.                                                    | `.agents/skills/`; `plugins/openseo/`; `src/server/features/sam/samSkills.ts`                                          |

### Can be composed from existing services

| Growth need                          | Smallest composition                                                                                                   | Relevant source paths                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Commercial/project context           | Reuse current goal, business overview, positioning and competitors; add only Growth-specific structured settings.      | `src/db/project-context.schema.ts`; `src/types/schemas/projectContext.ts`; `src/server/features/project-context/` |
| Priority pages                       | Extend `project_key_pages` with Growth metadata rather than add `growth_priority_pages`.                               | `src/db/project-context.schema.ts`; `src/server/features/project-context/services/contextUpdateOps.ts`            |
| Priority-page decline                | Query two bounded GSC periods through `GscService`; persist a Growth Signal/evidence reference.                        | `src/server/features/gsc/services/GscService.ts`; `src/server/features/gsc/searchPerformanceReport.ts`            |
| Low-CTR/striking-distance candidates | Reuse current GSC dimensions and pure striking-distance shaping; add materiality/commercial weighting.                 | `src/serverFunctions/searchPerformance.ts`; `src/server/features/gsc/searchPerformanceReport.ts`                  |
| Persistent rank loss                 | Select comparable completed runs and rank snapshots; add multi-check persistence/suppression.                          | `src/server/features/rank-tracking/repositories/snapshotQueries.ts`; `rankTrackingResults.ts`                     |
| Conversion-aware opportunities       | Reuse GA4 report services or the current GSC+GA4 scorer, then apply Growth context/history.                            | `src/server/features/ga4/services/SearchOpportunityService.ts`; `Ga4ReportingService.ts`                          |
| New audit issue detector             | Compare retained audit runs after adding cadence, compatible-run selection and stable issue matching.                  | `src/server/features/audit/repositories/AuditRepository.ts`; `src/db/audit.schema.ts`                             |
| Backlink evidence                    | Use provider history or capture an idempotent summary in a Growth run; do not treat visit snapshots as canonical.      | `src/server/features/backlinks/services/`; `BacklinkSnapshotRepository.ts`                                        |
| Monthly report data                  | Compose GSC/GA4/rank/audit/backlink summaries with durable Growth Actions/Measurements, then freeze a report snapshot. | `src/server/features/dashboard/services/DashboardService.ts`; current feature services                            |
| Growth MCP reads                     | Add definitions to the existing server using `withMcpProjectAuth`, `mcpResponse` and instrumentation.                  | `src/server/mcp/server.ts`; `src/server/mcp/project-auth.ts`; `src/server/mcp/formatters.ts`                      |
| Growth cadence                       | Reuse Cloudflare Workflow/crons and rank due-scan/CAS patterns after Growth runs/settings exist.                       | `src/server.ts`; `wrangler.jsonc`; `src/server/features/rank-tracking/services/scheduledRankChecks.ts`            |

### Growth-specific work required

| Missing operating-layer capability | Required work                                                                                                                                             | Relevant integration paths                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Growth settings                    | One project-scoped settings model for enabled state, report timezone/cadence and measurement defaults. Keep business prose/competitors in project memory. | `src/db/project-context.schema.ts`; `src/server/features/project-context/`; new Growth feature boundary |
| Priority-page semantics            | Add commercial weight/protected/optimization metadata and validate URLs against the project domain.                                                       | `src/server/features/project-context/services/contextUpdateOps.ts`; `src/server/features/projects/`     |
| Runs and Signals                   | Dual-dialect tables, repositories/services, deterministic evidence/provenance, idempotent cadence slot and failure metadata.                              | `src/db/`; `src/db/runBatch.ts`; new `src/server/features/growth/`                                      |
| Insights and Recommendations       | Separate persistence, evidence links, versioned/validated AI output, review states and deterministic dedupe.                                              | new Growth feature boundary; existing Zod/service patterns                                              |
| Actions and history                | Canonical Action state machine plus immutable Action events, ownership and cross-project constraints.                                                     | new Growth repositories/services; existing project auth middleware                                      |
| Change Events                      | Project-scoped manual records, URL/domain validation and Action links; later deployment/CMS adapters.                                                     | new Growth services; existing domain utilities                                                          |
| Measurements                       | Plans, metrics, observations, results, comparison context, data completeness and confounder handling.                                                     | new Growth services composing GSC/rank/GA4                                                              |
| Frozen Reports                     | Versioned report headers/sections, structured builder and immutable publish state. Share tokens/read-only route come later.                               | new Growth services/routes; existing export helpers only for convenience                                |
| Detector policy                    | Versioned thresholds, low-volume suppression, debounce, open-work linkage and false-positive tests.                                                       | new Growth detectors; current feature services as adapters                                              |
| Scheduled Growth orchestration     | Due selection, workflow binding/class, run locking, retries, cost summary and cron dispatch.                                                              | `wrangler.jsonc`; `src/server.ts`; `alchemy.run.ts`; new Growth workflow                                |
| MCP write security                 | Operation allowlist/capability decision, immutable audit event, idempotency and isolation tests. Current `mcp` scope is too broad.                        | `src/server/mcp/context.ts`; `src/server/mcp/project-auth.ts`; new Growth policy                        |
| Durable AI visibility monitoring   | Prompt sets, cadence, model/prompt versions and persisted observations, only after the core loop works.                                                   | `src/server/features/ai-search/`                                                                        |

### Plan assumptions that are now stale or wrong

| Planning assumption                                                            | Current fact/correction                                                                                                                                 | Relevant source paths                                                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| GA4 is evolving and should wait until Phase 8.                                 | OAuth, reports, diagnostics, opportunity scoring and MCP are already implemented. Reuse now; only Growth persistence/measurement semantics are missing. | `src/server/features/ga4/`; `src/server/mcp/server.ts`                                                      |
| Generic GA4 MCP may be an upstream contribution.                               | Ten GA4/search-opportunity MCP tools already ship.                                                                                                      | `src/server/mcp/tools/google-analytics-tools.ts`; `src/server/mcp/server.ts`                                |
| MCP follows one tool per file.                                                 | Several established files group related tool families.                                                                                                  | `src/server/mcp/tools/`; `src/server/mcp/server.ts`                                                         |
| MCP always resolves organization membership.                                   | Hosted uses memberships; Cloudflare/local delegated organizations have no member rows.                                                                  | `src/middleware/ensure-user/`; `src/server/auth/delegated-organization.ts`                                  |
| Every MCP request requires project context.                                    | Project tools require explicit `projectId`; identity/list/create tools are organization-level.                                                          | `src/server/mcp/project-auth.ts`; `src/server/mcp/tools/whoami.ts`; `list-projects.ts`; `create-project.ts` |
| API-key MCP auth is available for a normal self-host deployment.               | `oseo_` keys are hosted-only. Cloudflare self-host uses Access Managed OAuth; local mode is unauthenticated.                                            | `src/lib/auth.ts`; `src/server/mcp/api-key-auth.ts`; `src/server/mcp/transport.ts`                          |
| Phase 1 needs a new project context, competitor model and priority-page table. | Project memory, normalized competitors and curated key pages now exist. Extend/reuse them.                                                              | `src/db/project-context.schema.ts`; `src/server/features/project-context/`                                  |
| Existing key-page validation is sufficient for protected Growth writes.        | URLs are normalized but are not checked against the owning project's domain.                                                                            | `src/server/features/project-context/services/contextUpdateOps.ts`                                          |
| Existing backlink snapshots are dependable historical snapshots.               | Capture is dashboard-visit-triggered; repository reads only latest.                                                                                     | `src/server/features/dashboard/services/DashboardService.ts`; `BacklinkSnapshotRepository.ts`               |
| OpenSEO already has a reusable scheduler/queue.                                | It has a fixed cron dispatcher and two feature-specific Workflows, not a generic scheduler.                                                             | `src/server.ts`; `wrangler.jsonc`; `src/server/workflows/`                                                  |
| Site audits are scheduled.                                                     | Audits are manually started; cron only reconciles dead/stale runs.                                                                                      | `src/serverFunctions/audit.ts`; `src/server/features/audit/services/auditReconciler.ts`                     |
| AI visibility is historical product state.                                     | Current results are R2-cached live responses and browser-local history, with no project snapshots or MCP tools.                                         | `src/server/features/ai-search/`; `src/client/hooks/use*SearchHistory.ts`                                   |
| Postgres is an immediately available self-host toggle.                         | Runtime support exists, but the standard self-host/non-production Alchemy path does not provision Hyperdrive.                                           | `src/db/provider.ts`; `src/db/pg/client.ts`; `alchemy.run.ts`                                               |
| MCP handlers always call services rather than repositories.                    | This is preferred but not universal; site-audit tools currently call the audit repository directly.                                                     | `src/server/mcp/tools/site-audit-tools.ts`                                                                  |

## Repository health

The dependency graph was installed from the existing lockfile with pnpm 10.30.1. No dependency manifest or lockfile was changed.

| Check                            | Result                                                                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile` | Pass. 983 locked packages installed; no dependency changes.                                                                                                                                                              |
| `pnpm test:ci`                   | Pass. 133 test files and 1,113 tests passed.                                                                                                                                                                             |
| `pnpm vite build`                | Pass. Client and SSR/Worker bundles completed, including the eager-bundle guard. Wrangler could not create its optional user-level debug-log directory inside the sandbox, but the build exited 0.                       |
| `pnpm ci:check`                  | Pass. Prettier, Knip, root and `badseo` TypeScript, type-aware Oxlint, skill sync and generated-skill cleanliness all passed.                                                                                            |
| `pnpm --dir web run types:check` | Pass. Fumadocs types generated and TypeScript passed; Fumadocs printed a non-blocking Zod v3 recommendation.                                                                                                             |
| `pnpm --dir web run build`       | Pass outside the filesystem/network sandbox. Client/SSR bundles, prerendering of 81 pages and sitemap generation completed. The first sandboxed attempt could not start TanStack's temporary localhost prerender server. |
| Docker image build               | Not run locally. Upstream CI built it successfully for the identical commit.                                                                                                                                             |

Upstream CI for the exact base SHA is green: [CI run 32676314249](https://github.com/every-app/open-seo/actions/runs/32676314249) completed successfully on 24 August 2026, including the main CI and Docker build jobs. The Bodkin fork has no check runs yet.

The Corepack cache had to be redirected to a temporary writable directory in this sandbox; that is an execution-environment constraint, not a repository failure.

## Smallest Phase 1 implementation sequence

The current code removes an entire planned slice: project business context, competitors and key pages no longer need to be built. The smallest Phase 1 sequence is six mergeable sessions:

1. **Growth schema ADR only**
   - Confirm table/relationship names and the Cloudflare Access/D1 prototype decision.
   - Explicitly reuse `project_context_sections`, `project_competitors` and `project_key_pages`.
   - Decide whether Growth-specific key-page columns extend `project_key_pages` or live in a one-to-one metadata table; do not create a second URL list.
   - Define cross-project constraints, event immutability and the evidence-reference contract before migrations.

2. **Growth settings plus key-page metadata**
   - Add only enabled state, report timezone/cadence and measurement defaults.
   - Add commercial weight/protected/optimization metadata to the existing key-page model.
   - Enforce project-domain URL validation.
   - Follow TanStack server function → service → repository and generate both migration paths.

3. **Growth runs and deterministic Signals**
   - Add run/status/period/version/failure/cost fields and Signal/evidence persistence.
   - Add natural cadence-slot uniqueness and cross-project tests now, before scheduling.
   - Prove manual service-level creation; no AI, workflow or UI.

4. **Insights, Recommendations, Actions and Action events**
   - Add separate fact/interpretation/proposal/work models and their normalized links.
   - Implement Recommendation review states and an explicit Action state machine with immutable history.
   - Exercise the chain with fixtures only; do not build a generator or board yet.

5. **Change Events and Measurements**
   - Add URL-scoped Change Events, Action links, Measurement Plans, metrics, observations and results.
   - Implement date/state/confounder rules against a deterministic synthetic fixture.
   - Keep collection adapters out of this slice.

6. **Frozen report snapshot and Phase 1 gate test**
   - Add report header/sections and a deterministic structured report builder.
   - Complete one service-level test of `Signal → Insight → Recommendation → Action → Change → Measurement → Report` in both dialect-compatible schema paths.
   - No share route, PDF, scheduled orchestration, Growth MCP, detector, AI generation or portfolio UI yet.

Only after this gate should Phase 2 add the narrow GSC adapter and the first deterministic priority-page decline detector. GA4 can enrich later detectors immediately through current services, but it should not expand the first vertical slice.

The rule for every session remains:

> Reuse OpenSEO. Build only the missing Growth operating layer.
