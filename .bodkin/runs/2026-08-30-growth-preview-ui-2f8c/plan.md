# Goal

Deliver the fixture-backed Growth screen the user agreed to continue with: inspect which priority pages need attention and inspect the numeric evidence in the existing OpenSEO application. This is a preview checkpoint, not completion of BG-0208 or the Phase 2 usefulness gate.

# Scope

- A project-scoped `/p/$projectId/growth` route and a clearly labelled Growth preview navigation entry.
- A bounded sample-data response composed by the existing deterministic detector and evidence-packet builder. No real project content, credentials or provider calls enter the response.
- An accessible page list, filtering and read-only detail with source facts, comparison periods, current sample context, selected sample changes and limitations.
- A reproducible loopback-only development launcher with a disposable source snapshot/database and an allowlisted environment.
- Independent tests, repository gates, browser evidence and fresh engineering/UI reviews, followed by a local commit.

# Relevant areas/files

- `docs/growth/README.md`, `04_IMPLEMENTATION_PLAN.md`, `AGENTS_BODKIN_APPENDIX.md`, ADRs 028/029: evidence-first operating loop and remaining product scope.
- `src/routes/_project/p/$projectId/search-performance.tsx`, `src/client/navigation/items.ts`: project route and navigation precedent.
- `src/client/features/search-performance/SearchPerformancePage.tsx`, `SearchPerformanceParts.tsx`, `src/client/styles/app.css`: spacing, typography, surfaces, controls and themes.
- `src/serverFunctions/growth.ts`, `middleware.ts`: existing authorized server-function boundary.
- `GrowthSearchPerformanceFixture.ts`, `PriorityPageClickDeclineDetector.ts`, `GrowthEvidencePacket.ts`: existing sample observations and domain behavior.

# Implementation approach

1. Shape a list/detail extension using existing app patterns. Read-only delegated discovery established the integration and isolated startup path. The agent pool cannot create another implementation agent, so the Director implements the feature and launcher directly; reviewers remain independent of implementation.
2. Use a separate fixture-only composer and a validated project-authorized server function. Keep fixed sample identities distinct from the authorized real project and state that the preview is identical across projects.
3. Project the existing 90-day fixture onto reserved `example.com` URLs because the Growth target normalizer intentionally rejects `.test`; do not change either normalizer or existing detector/packet behavior.
4. Derive numeric results from existing code at runtime, never from manually copied display totals. Return no raw provider observations. Supply explicitly synthetic current context and one selected sample Change Event.
5. Verify the full scoped interaction and data contract. Start only a credential-free, disposable local app. Do not visit a domain-backed dashboard because its existing behavior can collect backlink data.

# Constraints

Reuse current project auth, React Query, TanStack Router, DaisyUI/Tailwind and existing domain functions. No new dependencies, schema/migration changes, auth rewrites, provider/model calls, production data or deployment. Keep unrelated working-tree edits intact. Commit only this checkpoint.

# Explicit non-goals

AI generation, persisted detector runs, live-site usefulness, recommendations/approval actions, scheduling, Growth MCP, report exports, a new design system, and a second service or database architecture. The preview database is disposable test infrastructure, not a product database.

# Risks

- Sample data mistaken for connected project data: persistent preview labelling and fixed sample identity, including error/loading states.
- Missing/low-volume evidence represented as health or zero: preserve suppression reasons and unavailable values; render explanations instead of invented metrics.
- Protected data or paid calls through app bootstrap: isolate source, environment and persistence; seed offline and navigate directly to the known Growth route.
- Client/server bundle leakage or broken auth: use the existing server-function boundary and prove the fixture composer does not call repositories or providers.
- Responsive/focus regressions: retain app shell, use native controls and inspect desktop/mobile/keyboard behavior.

# Verification plan

Director-owned focused fixture/contract/render tests, launcher isolation tests, full Vitest suite, `pnpm ci:check`, `pnpm build` and whitespace checks. Run the UI preflight coordinator with this run's configuration. Capture representative list/detail and filtered-empty states at desktop and mobile sizes, inspect browser errors and keyboard navigation, and obtain fresh read-only engineering and Bodkin UI review. Two engineering repair rounds maximum; two visual review cycles maximum. No acceptance claim without the required evidence.

# Routing and skill decisions

STANDARD: bounded feature and new read-only API projection, existing architecture, no changed authentication policy or real-data egress. UI mode EXTEND/material. The Bodkin extension workflow owns shape, preflight and visual review. The optional Impeccable new-work setup requires a new product interview and global product record; that would expand this specified preview, so its broader setup is not used. Existing product docs and incumbent UI are the authority; its craft guidance and the installed accessibility guidance inform local checks. The UI skills CLI is not cached; installed skill files supply the fallback without installing dependencies.
