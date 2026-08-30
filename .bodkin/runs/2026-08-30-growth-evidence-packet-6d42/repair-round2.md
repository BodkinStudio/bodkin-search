# Escalation and final bounded repair

The fresh repair review confirms two valid remaining findings. There are no new architecture or product decisions.

## Why escalate

Temporal input validation was a major finding in the initial implementation. Round 1 fixes the original examples but still diverges from the established source contract on hour 24 and fractional precision. This is a repeated material validation cause, so the Bodkin escalation rule applies before the last permitted repair.

## Chosen escalation

Use a fresh frontier implementer (`gpt-5.6-sol`, high reasoning) for the two narrow corrections below. This changes the Codex execution profile, not the product scope or user authority. No product AI call, live provider request or external review service is introduced. This is repair round 2; a third automatic implementation repair is prohibited.

## Accepted dispositions

1. **Timestamp source-contract drift: valid.** Replace the hand-written timestamp expression with the already-installed Zod offset-datetime contract, then canonicalise the valid instant. Do not require exactly three input fractional digits, accept hour 24, or silently correct calendar values. Existing source/projection/date/lag tests stay intact.
2. **Duplicate selected commercial sections: valid.** Reject multiple rows for an allowlisted commercial key before choosing its content. Continue ignoring non-allowlisted context fields; do not turn unrelated memory into an error or a hash input.

## Ownership and limits

The escalated implementer owns only the two affected areas and necessary imports/constants in `GrowthEvidencePacket.ts`. No schema, service, normaliser, provider, dependency, auth, UI, scheduling, lifecycle or broad refactor change is needed. All `*Acceptance.test.ts` files remain Director-owned. The pre-round-2 index is the exact repair baseline; leave edits unstaged.

Retain the original review's read-only/internal/no-egress, coarse candidate matching and final-safe-projection hashing constraints. Director independently runs the complete final gates. Fresh repair review and the separate DEEP acceptance audit still decide acceptance.
