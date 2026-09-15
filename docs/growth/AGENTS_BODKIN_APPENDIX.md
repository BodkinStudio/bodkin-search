# Bodkin Growth - AGENTS.md Appendix

> Append or reference this beneath the upstream OpenSEO `AGENTS.md`. Do not delete or weaken upstream agent guidance.

## Scope

These rules apply to Bodkin Growth work in the OpenSEO fork.

## Product invariant

Growth exists to preserve this traceable chain:

```text
Signal
→ Insight
→ Recommendation
→ Action
→ Change Event
→ Measurement
→ Report
```

Do not collapse these concepts merely to reduce table count.

## Upstream first

Before implementing a Growth feature:

1. search the current repository for existing services, schemas and UI patterns;
2. check recent upstream changes/issues when the capability is likely to be evolving;
3. reuse existing OpenSEO services instead of calling DataForSEO/Google directly;
4. document any intentional duplication.

## Avoid speculative architecture

Do not create:

- a separate Growth backend;
- a second auth system;
- a second project/organisation model;
- a second MCP server;
- a new queue framework;
- a new provider client

without an explicit ADR.

## Module isolation

Prefer Growth-specific code under clearly named feature boundaries.

Avoid broad modifications to unrelated OpenSEO features.

When a core change is unavoidable, keep it minimal and explain why in the PR/task summary.

## Dual database rule

Any schema/query change must remain compatible with OpenSEO's SQLite/D1 and Postgres paths.

Generate/update both migration paths as required by current upstream instructions.

## Evidence integrity

- Signals contain measured/derived observations.
- Insights contain interpretation/hypothesis.
- Recommendations contain proposed response.
- AI-generated text must never overwrite underlying numeric evidence.
- Recommendations must reference supporting evidence.
- Measurement language must not claim causation without support.

## AI boundary

Use AI only after a bounded evidence packet has been built.

Do not pass large unfiltered provider payloads to a model.

All AI outputs must be schema validated.

Store model + prompt/template version.

## Security

Every Growth query/mutation must be project scoped.

MCP write tools require:

- explicit permission check;
- audit event;
- URL/project validation;
- tests proving cross-organisation isolation.

Never expose secrets, OAuth tokens or provider credentials to model context.

## Cost

Prefer cached/existing OpenSEO data.

Any new scheduled provider call must have a clear cadence and cost rationale.

Do not trigger paid calls merely because a UI page was viewed unless this matches an established upstream pattern and is intentional.

## Change history

Do not silently mutate historical reasoning.

Prefer event/history records where a user needs to understand how an Action changed over time.

## Measurement

`implemented` is not equivalent to `completed`.

An implemented SEO Action normally enters a measuring state and is later evaluated.

Flag confounding Change Events.

## UX

Optimise for decisions, not metric density.

Default screen question:

> What needs attention and what should we do next?

## Codex task discipline

For every non-trivial task:

1. inspect existing code;
2. write a short implementation note;
3. identify tests;
4. implement the smallest coherent slice;
5. run upstream-required CI checks;
6. report changed files, tests and any unresolved risks.

Do not opportunistically redesign or refactor unrelated OpenSEO code while implementing Growth.
