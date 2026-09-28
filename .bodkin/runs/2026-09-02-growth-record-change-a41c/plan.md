# Goal

Implement BG-0607 `growth_record_change` as the first controlled Growth MCP
write on the existing OpenSEO MCP server.

The tool records one immutable, idempotent manual Change Event for authorized
project URLs. It is available only to hosted OAuth grants that explicitly carry
`growth:change:create`; existing API keys, self-hosted MCP and in-app SAM remain
read-only for Growth writes.

# Scope

- Add the operation scope `growth:change:create` to the hosted authorization
  server's supported scopes while retaining `offline_access mcp` as the default
  grant and `mcp` as the protected resource's minimal baseline scope.
- Keep API keys on the default scopes only. Do not infer Growth write permission
  from an `mcp` scope, valid API key, self-hosted identity or first-party SAM
  session.
- Register `growth_record_change` only when the server's verified token props
  carry the operation scope, and enforce the same scope again inside the tool
  handler before project lookup or any service/write call.
- Reuse the established project/organisation authorization gate after the
  operation gate and before the write service.
- Accept strict project ID, UUID request key, closed change type, bounded
  description, non-future offset timestamp and 1-100 exact URLs. Do not accept
  actor/source/creation-key fields from the model.
- Derive a stable, bounded internal agent actor from the authenticated user and
  client identities. Namespace the creation key by that principal and request
  UUID so exact retries recover the same immutable fact while changed retries
  conflict.
- Delegate canonical URL normalization, project-domain validation, immutable
  fact hashing, atomic graph creation and race recovery to the existing
  `GrowthChangeEventsService` and repository.
- Return one strict privacy-safe Change Event card using the same description,
  URL and timestamp projection as `growth_get_recent_changes`.
- Record the public security and data boundary in Growth architecture decisions.

# Relevant areas/files

- `src/lib/oauth-resource.ts` owns OAuth scope constants.
- `src/server/mcp/oauth-provider.ts` owns supported/default scope grants,
  protected-resource metadata and token refresh props.
- `src/server/mcp/api-key-auth.ts` mints hosted MCP props for API keys.
- `src/server/mcp/context.ts`, `project-auth.ts` and `server.ts` own tool auth,
  project authorization and registration.
- `GrowthChangeEventsService` already owns immutable idempotent creation,
  project-domain URL validation and D1/Postgres write behavior.
- `GrowthRecentChangesReadService` already owns the public privacy-safe Change
  Event projection.

# Implementation approach

1. Split default OAuth scopes from supported OAuth scopes. Advertise the new
   operation scope, grant it only when explicitly requested and consented, keep
   API keys on the default set, and make the token-exchange callback independently
   reject any requested scope absent from both the stored grant scope and the
   original verified grant props even though the provider also downscopes it.
2. Add a small reusable MCP operation-scope wrapper and a props-level
   registration predicate. Compose operation authorization outside project
   authorization so a missing capability performs no project or Growth read.
3. Add strict request/result schemas and extract the existing safe single-event
   projector so the read and write tools cannot drift on privacy or cardinality.
4. Add an application service that derives the actor/creation key, invokes the
   existing Change Event service and returns the strict safe projection.
5. Add the shared MCP tool definition to external MCP only, conditionally
   registered for capable OAuth tokens. Do not add it to SAM.
6. Add ADR-044, focused tests, full repository checks and fresh adversarial
   review.

# Constraints

- Reuse OpenSEO's database, auth, organisation/project tenancy and MCP server.
- Add no dependencies, migrations, provider calls, credit use, CMS writes or
  second Growth service/database/auth/MCP deployment.
- Permission and project authorization must both complete before any Growth
  service or database write.
- Scope absence fails closed: the tool is absent from discovery and direct
  handler invocation is forbidden.
- Existing OAuth clients and refresh flows retain read access without gaining
  the new write scope.
- Token exchange may only preserve or narrow the original grant. It must never
  widen a legacy/read-only grant, including when the callback is invoked directly
  in a unit test with a forged broader `requestedScope`.
- The immutable Change Event itself is the audit record; internal actor and
  creation-key values never enter public output.
- Reject a future supplied `happenedAt`; describe accepted timestamps as
  caller-supplied rather than independently verified.

# Explicit non-goals

- Growth Action creation/status writes, Action linking, automatic measurement
  start, provider writes, deployments/webhooks, CMS publication or opportunity
  discovery.
- Granting Growth writes to API keys, self-hosted MCP, local no-auth, Cloudflare
  Access, SAM, or every holder of the broad `mcp` scope.
- A new role/RBAC matrix, per-project key format, consent-page redesign or
  separate audit table.
- External references in the first public input; the UUID request key supplies
  the required idempotency coordinate without accepting another untrusted
  identifier.
- Returning hashes, actors, client/user IDs, creation keys, raw project domain,
  Action links or more than five safe display URLs.

# Risks

- Reusing one scope list for supported and default grants would silently give
  existing/API-key clients write access. Keep the constants and tests separate.
- Conditional registration alone can be bypassed by directly importing a tool
  definition. Enforce the operation scope again at handler invocation.
- Checking project access before capability leaks project existence and does
  unnecessary reads. Compose capability first and assert call order in tests.
- Model-supplied actor/source fields would undermine the audit fact. Derive
  both internally from the verified context and fixed manual/agent semantics.
- Unbounded OAuth client IDs could violate the 200-character actor constraint.
  Preserve a readable principal when bounded and fall back to a stable SHA-256
  label; always hash the principal in the creation-key namespace.
- Returning the existing UI DTO would expose unsanitized description text and
  too many URLs. Reuse the stricter recent-changes projection instead.
- `happenedAt` is a supplied fact, not proof that publication occurred. State
  this in tool text and output documentation.

# Verification plan

- OAuth tests prove authorization-server metadata includes
  `growth:change:create` while protected-resource metadata keeps only the
  baseline `mcp` challenge, empty requests still grant only default scopes,
  explicit requests can receive the capability, and missing `mcp` still fails.
- Callback unit tests and the real provider refresh suite prove a read-only
  grant cannot add `growth:change:create`, an omitted refresh scope preserves its
  original set, a narrowed refresh stays narrowed, and a consented write grant
  can retain—but not expand—its capability.
- API-key tests prove valid keys receive default scopes without the Growth write
  capability. Existing self-host transport tests prove scopes remain absent.
- Operation-auth tests prove denial precedes project lookup/service execution
  and capability plus project access is required.
- Schema/service tests cover strict unknown-field rejection, future timestamps,
  derived actor/creation key, exact replay, changed-retry conflict, long auth
  identities, cross-domain rejection, URL deduplication and safe projection.
- Existing SQLite/D1 and live PostgreSQL Change Event integration suites plus a
  focused MCP write integration prove provider parity, project isolation and
  atomic idempotent behavior.
- A real in-process MCP protocol test proves the tool is absent for `mcp`-only
  props, present for the explicit capability, advertises non-read-only,
  non-destructive, closed-world behavior, and returns only the strict DTO.
- Run focused tests with one worker, `pnpm ci:check`, full tests with one worker,
  a 4 GB-capped production build, `git diff --check` and staged whitespace
  checks before final acceptance.

# Required behaviour

1. `growth_record_change` exists only on the existing external OpenSEO MCP
   server and only for verified auth props containing both `mcp` and
   `growth:change:create`. It is not added to project-bound SAM.
2. OAuth advertises the capability but does not include it in an omitted-scope
   default grant. API keys retain only `offline_access mcp`. Existing tokens
   without the capability remain read-only and revocation continues through the
   existing OAuth grant lifecycle.
3. Token exchange cannot issue a scope outside either the stored grant scope or
   its verified auth props. The provider safely downscopes an ungranted raw
   refresh request before the callback; the callback rejects any forged broader
   request that reaches it. Refresh can preserve or narrow a consented grant but
   cannot add `growth:change:create` to a read-only grant.
4. The handler checks `growth:change:create` before canonical project
   authorization, then checks caller organisation ownership of `projectId`
   before invoking any Growth service or write.
5. Input is strict and model-visible only for `projectId`, UUID `requestKey`,
   one closed Growth change type, 1-5,000 character description, non-future
   offset `happenedAt`, and 1-100 bounded absolute exact URLs.
6. Source is fixed to `manual`; actor type is fixed to `agent`; actor ID and
   the <=200-character creation key derive from verified auth, never caller
   input. No external reference is accepted or stored by this first contract.
7. URL canonicalization removes query/fragment, deduplicates and orders URLs,
   and rejects every URL outside the active project's configured domain before
   insertion. Archived/missing/foreign projects cannot produce a Change Event.
8. The write remains append-only and idempotent. An exact retry by the same
   principal/request key returns the same event; a changed immutable fact with
   that coordinate conflicts; concurrent writers use the existing atomic
   first-writer behavior.
9. Output is a strict safe card: ID, manual source, type, projected description
   with redaction/truncation flags, canonical supplied/recorded timestamps,
   exact bounded URL count and at most five projected URLs with omission/
   withholding metadata. It excludes actor, auth, key, hash and graph internals.
10. Tool description/text states that it writes saved OpenSEO state, uses zero
    credits and no providers, that `happenedAt` is caller supplied, and that it
    does not link an Action, change Action status or start Measurement.

# Required checks

- Focused auth, OAuth, API-key, schema, service, SQLite/D1, live PostgreSQL and
  MCP handler/protocol tests pass with a single worker.
- `pnpm ci:check`, full tests, production build and whitespace checks pass
  within the memory limits above.
- Fresh independent review has no unresolved critical/major finding or material
  verification gap, followed by Director acceptance.

# Regression constraints

- Existing read tools remain visible to every current authorized MCP client.
- Existing OAuth authorization/refresh, API-key auth, hosted transport,
  self-hosted transport and SAM behavior continue to pass.
- Existing UI manual Change Event creation and Change Event service/repository
  semantics remain unchanged.
- No schema, migration, dependency or provider boundary changes.

# Important edge cases

- An OAuth request with no scopes; with only `mcp`; with `mcp` plus the Growth
  capability; and without required `mcp`.
- A valid API key and self-hosted identity must not discover the tool.
- Direct handler invocation with the missing capability, foreign project or
  archived project must perform no write.
- Client/user identity longer than the actor bound.
- Duplicate URLs, query/fragment URLs, subdomains accepted by the project's
  existing scope rules, deceptive sibling domains and mixed-domain batches.
- Exact retry, changed retry, and two clients reusing the same request UUID.
- Future, offset and boundary timestamps; descriptions containing credentials,
  email or URL-like text; six and 100 stored URLs.

# Product / UX requirements

No Growth page UI change is in scope. The existing OAuth consent copy already
discloses that an MCP client may write results back; the new privilege is still
granted only when the client explicitly requests its advertised operation
scope and the user approves that grant.

# Specialist review requirements

Fresh adversarial review must focus on default-versus-supported scope drift,
token refresh escalation, conditional registration plus handler defense,
capability-before-tenancy ordering, actor/key derivation, immutable idempotency,
cross-domain and cross-project isolation, safe output projection, and the
absence of API-key, self-hosted or SAM write inheritance.
