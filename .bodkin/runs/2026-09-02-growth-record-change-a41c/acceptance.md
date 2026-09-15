# Required behaviour

1. `growth_record_change` is registered on the existing external OpenSEO MCP
   server only when verified auth props contain both `mcp` and
   `growth:change:create`. It is absent from API-key, self-hosted and SAM
   discovery.
2. Hosted OAuth advertises the operation scope without adding it to default
   grants or protected-resource baseline metadata. Token exchange can preserve
   or narrow an original grant but cannot add a capability missing from either
   the stored grant or its verified auth props.
3. The handler repeats the operation-scope check before project authorization;
   canonical organisation/project authorization completes before any Growth
   service or database write.
4. Input is strict and limited to project ID, UUID request key, closed change
   type, bounded description, non-future offset timestamp and 1-100 absolute
   project URLs. Actor, source and creation key are never caller controlled.
5. Verified user/client identity is encoded without delimiter ambiguity and
   namespaces the bounded actor and creation key. Exact retries replay one
   immutable event; changed retries conflict; two principals may safely reuse
   the same request UUID.
6. The existing Change Event service and repository retain URL normalization,
   project-domain validation, immutable fact hashing, transactional graph
   creation and race recovery on SQLite/D1 and PostgreSQL.
7. Output uses the shared recent-change privacy projector and exposes only the
   strict safe card. Actor, auth identities, creation key, fact hash and graph
   internals remain private.
8. Tool metadata and response text state that this is a saved-state write with
   no provider or credit use, that `happenedAt` is caller supplied, and that no
   Action linking/status or Measurement start occurs.

# Required checks

- Focused auth, OAuth, API-key, schema, service, SQLite/D1, live PostgreSQL,
  handler, protocol and SAM regressions pass with one worker.
- `pnpm ci:check`, the full one-worker suite, production build and staged plus
  unstaged whitespace checks pass under the 4 GB Node heap cap.
- Fresh independent adversarial review passes without findings or evidence
  gaps, followed by Director acceptance.

# Regression constraints

- Existing MCP read tools and existing read-only clients retain their prior
  behavior without silently gaining write capability.
- Existing UI Change Event creation, Change Event persistence and Growth read
  projection remain shared rather than forked.
- No schema, migration, dependency, provider, credit, UI, scheduling, report,
  Action or Measurement lifecycle change is introduced.

# Specialist review requirements

The final review examined the staged implementation and completed verification
record, focusing on OAuth scope drift/escalation, authorization order, transport
and handler defenses, excluded auth modes, idempotency coordinates, immutable
write reuse, output privacy and truthful tool semantics. Its verdict is pass.
