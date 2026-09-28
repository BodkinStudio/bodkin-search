# Required behaviour

1. `growth_get_recent_changes` is registered on the existing OpenSEO MCP server
   and adapted from that same definition into project-bound SAM. SAM removes the
   model-visible project ID and injects its server-bound project.
2. Input is strict `projectId`, optional 1-50 limit (default 20), and optional
   strict `{ happenedAt, id }` continuation cursor. Equivalent offset cursor
   timestamps are canonicalized before repository comparison.
3. Canonical MCP project authorization completes before the read service. Every
   repository query leads with project ID and foreign/missing projects cannot
   trigger a Change Event read.
4. Only saved `manual` Change Events are eligible. Root order and keyset
   semantics are canonical happenedAt descending then SQLite BINARY/PostgreSQL
   C ID descending. Cap-plus-one yields truthful `hasMore`/`nextCursor`, with no
   total or snapshot claim.
5. Cards expose only ID, literal manual source, change type, safe description,
   canonical happened/recorded timestamps, exact URL count up to the stored
   integrity bound, and at most five safe display URLs with accurate omission
   and withholding markers.
6. Description and every stored URL are sanitized before smaller public caps.
   URLs omit query/fragment material and withhold credentials, emails or invalid
   values using the established Growth projector. Both window selection and
   emitted child order use SQLite BINARY/PostgreSQL C code-unit URL ordering.
7. Roots are selected before one project-leading bulk URL read. Each emitted
   root is independently capped at the 101-row integrity sentinel; a stored
   event with zero or more than 100 URLs is rejected before display truncation.
   No N+1 or join-multiplied page read is introduced.
8. Strict output excludes creation keys, hashes, actor IDs/types, external
   references, Action links, provider/account data, secrets and unknown fields.
9. Human text calls these saved manual Change Event records, explains that
   `happenedAt` is the supplied event timestamp rather than an independently
   verified occurrence, summarizes current page items, points to structured
   URLs, and mentions continuation only when available. It does not claim all
   ingestion sources, totals, snapshots, discovery, collection or writes.
10. Tool annotations/description state read-only, non-destructive,
    saved-data-only, zero credits, no provider calls and no writes.

# Required checks

- Focused schema, SQLite/D1 repository, live PostgreSQL repository, service,
  MCP handler/protocol and SAM tests pass.
- `pnpm ci:check`, full tests, production build, `git diff --check` and staged
  whitespace checks pass.
- Fresh independent review has no unresolved critical/major finding or material
  verification gap, followed by Director final acceptance.

# Regression constraints

- Existing manual Change Log UI and write services remain unchanged.
- Existing Growth MCP tools, MCP authorization/transport and SAM project binding
  continue to pass.
- No database/provider/schema/migration/dependency/auth changes are introduced.

# Important edge cases

- Equal happened timestamps with IDs whose locale ordering differs from binary
  code-unit ordering.
- Cursor timestamps supplied with non-UTC offsets.
- SQLite default `YYYY-MM-DD HH:mm:ss` recorded timestamps.
- Empty/final pages and cap-plus-one continuation.
- Foreign URL child rows, provider-sensitive URL ordering, and roots with zero
  or more than 100 URLs.
- A future supplied `happenedAt` row is included without claiming its timing was
  independently verified.
- Descriptions containing secrets, emails or URLs; URLs with queries,
  fragments, credentials, emails or invalid schemes.

# Product / UX requirements

The MCP deep link targets the existing Growth Change Log. No UI change is in
scope.

# Specialist review requirements

Fresh adversarial review must focus on manual-only truthfulness, auth-before-
read, provider-equivalent keyset ordering, per-parent child bounds, timestamp
canonicalization, privacy projection, strict public output and absence of any
write/provider path.
