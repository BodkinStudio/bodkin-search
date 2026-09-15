# Goal

Implement the PRD read tool `growth_get_recent_changes` on the existing OpenSEO
MCP server and in project-bound SAM.

The first contract is deliberately the saved manual website-change log that
already powers Growth. It does not claim to include future Sherpa, webhook or
deployment ingestion, and it does not create or link Change Events.

# Scope

- Add a strict project-scoped, keyset-paginated read model for manual Growth
  Change Events.
- Order by immutable `happenedAt` descending, then SQLite BINARY/PostgreSQL C
  Change Event ID descending.
- Default to 20 and cap at 50, with cap-plus-one `hasMore` and a strict
  continuation cursor.
- Return privacy-safe cards containing ID, manual source, change type, safe
  description, happened/recorded timestamps, and at most five safe URLs with
  exact bounded count/omission/withholding metadata.
- Select roots first, then retrieve URL children in one project-leading,
  per-parent bounded query using provider-equivalent code-unit URL ordering.
  Reject rows outside the existing 1-100 URL write integrity bound before the
  public five-URL cap.
- Register one shared tool definition in external MCP and project-bound SAM.
- Record the public boundary in Growth architecture decisions.

# Relevant areas/files

- `GrowthChangeEventsRepository` owns project-scoped Change Event and URL reads.
- `GrowthChangeLogService` proves the manual-log product boundary used by the UI.
- `growth-change-events.ts` defines source/type vocabulary and the 100-URL write
  bound.
- `GrowthEvidencePacket` supplies established safe description and URL
  projection.
- Existing Growth Action and Recommendation read tools provide strict schema,
  keyset, MCP protocol and SAM binding precedents.

# Implementation approach

1. Add strict request/card/page schemas and boundary tests.
2. Add a root page read plus a per-parent bounded bulk URL read, with SQLite/D1
   and live PostgreSQL parity tests.
3. Add a privacy-safe read service that canonicalizes timestamps, enforces the
   stored-child integrity bound and constructs the cursor.
4. Add the shared MCP tool, server/protocol registration and SAM adaptation.
5. Add an ADR, run focused and repository checks, then obtain fresh review.

# Constraints

- Reuse the existing database, tenancy, project authorization, MCP server and
  SAM adapter.
- Keep queries compatible with both SQLite/D1 and PostgreSQL.
- Do not add dependencies, migrations, provider calls, credits or writes.
- Authorization must complete before the read service is invoked.
- Sanitize all stored narrative and URLs before public truncation.

# Explicit non-goals

- Non-manual source ingestion or a claim that the tool includes Sherpa,
  deployment or CMS webhook events.
- Action-link reads, Action detail expansion, arbitrary URL/action/time/type
  filters, totals or historical snapshot semantics.
- `growth_get_measurements`, `growth_find_opportunities`,
  `growth_record_change`, UI, scheduling, notifications or reporting changes.
- Schema, migration, auth, transport or dependency changes.

# Risks

- Existing UI DTOs expose raw description text. Use a purpose-built public DTO
  with the established credential/email/URL sanitization boundary.
- SQLite default `createdAt` text differs from canonical ISO. Normalize at the
  service boundary before output.
- Child joins can multiply or starve roots. Page roots first and use a
  per-parent windowed child sentinel.
- Tool naming could imply all ingestion sources. State manual saved scope in
  schema, text, description and ADR.
- A valid lower-level manual event can carry a future supplied timestamp even
  though the current UI prohibits future dates. Include saved rows
  deterministically but describe `happenedAt` as the supplied event timestamp,
  not an independently verified occurrence.

# Verification plan

- Schema/service tests for strict defaults, cursor normalization, empty/final/
  continued pages, timestamp normalization, privacy projection and >100 URL
  integrity failure.
- SQLite/D1 and live PostgreSQL repository tests for manual-only scope,
  happenedAt/ID ties, cursor paging, project isolation, provider-equivalent URL
  order and per-parent child bounds.
- MCP tests for authorization-before-read, exact output/text and no provider or
  write path; in-process MCP and SAM tests for shared registration and bound
  project injection.
- Run focused tests, `pnpm ci:check`, full tests, production build and staged
  whitespace checks before final acceptance.
