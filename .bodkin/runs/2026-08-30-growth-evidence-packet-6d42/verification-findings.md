# Initial independent findings

The Director ran the new builder, composition and boundary tests against the initial implementation. The existing seven-file baseline passed (83 tests). The new tests produced 15 failures out of 49 cases; all failures below use dummy records and dummy credentials, not live accounts.

## Reproduced failures

1. The composition service checks the returned project ID but not its organisation ID. A mocked organisation-scoped read returning the requested project under another organisation still produces a packet. The real repository filters by organisation; this is a missing defence-in-depth check required by acceptance item 2, not evidence of a current public exploit.
2. Valid Change Event descriptions between 4,001 and 5,000 characters fail the global 4,000-character raw limit. A credential near character 4,700 is therefore rejected rather than safely projected. Conversely, invalid 201-character topics and 501-character notes are accepted. Existing source limits are in `growth-change-events.ts` and `projectContext.ts`.
3. A capture just before the three-Pacific-day boundary is accepted. The exact boundary case is `2026-07-01T06:59:59Z` for a current period ending June 28; the first valid capture is one second later.
4. Invalid rolled-over and timezone-less stored capture timestamps are accepted and normalised: `2026-09-31T12:00:00.000Z` and `2026-07-03T12:00:00`. The latter also depends on the host timezone.
5. A v1 decline packet accepts arithmetically consistent zero or positive click changes, despite identifying the Signal as a decline.
6. Event IDs `é` and `e` plus combining acute accent collate equally under `localeCompare`. Reversing source order changes output order and packet reference.
7. Missing selected event graphs become “irrelevant” coverage. Duplicate graphs can fill the selected count while another selected ID is missing. Every selected ID needs exactly one matching graph before relevance filtering.
8. Event `source` and `changeType` accept arbitrary free text, including a dummy provider-token string, instead of the existing closed vocabularies.
9. A recognisable provider token in the subject URL path is copied into the display URL and packet reference. The whole-field text credential filter does not protect this projection.
10. `pnpm ci:check` stops at Knip: the exported `GrowthEvidencePacketService` object is unused. The named composition function is exercised by the Director's tests; exporting both forms is unnecessary.

## Passing evidence

- Detector fixture facts survive composition unchanged; ignored source fields and instruction-like prose cannot alter the canonical envelope.
- The currently tested late text credential families are redacted before truncation; HTTP URL queries/fragments and email addresses are omitted.
- Explicit empty and absent selections remain distinct and partial.
- Existing Pacific event-window boundaries and coarser query/slash URL candidate matching pass.
- Same-day, leap-day, year-crossing and 45-day derived windows pass; 46-day, invalid-date and reversed windows reject.
- Ten-event Unicode projection stays within its byte limit; JSON-escaped control characters trigger the hard 32,768-byte rejection.
- Ignored private-field changes do not affect the packet reference; included safe text changes do. Source records remain unchanged.
- Both Director-owned acceptance files pass type-aware lint.

## Review pointers, not yet independently reproduced findings

Check disclosure flags for project name, topic and notes; bounded/closed runtime metadata; strict preserved identity; and complete coverage of the declared sensitive-assignment/token families. The raw-source type is currently TypeScript-only, so output validation alone should not be assumed to establish these input guarantees.

The initial tests briefly used the detector fixture's reserved `.test` host. That host is outside the existing Growth public-suffix target rules. The test now maps the fixed facts to IANA `example.com` before composition; the normaliser and fixture implementation were not changed. Those test-setup failures are not application findings.
