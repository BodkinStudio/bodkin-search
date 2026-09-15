# Goal

Continue the approved small Growth slices with a useful evidence-to-work step: review a saved investigation suggested by a new priority-page decline check, explicitly approve it with a due date, and reopen the approved work.

# Scope

STANDARD (7): feature-local orchestration, read/write wrappers and incumbent UI extension; existing project auth and domain invariants are reused, not changed. One backend implementer while the Director builds UI, followed by independent verification and fresh code/rendered review.

New checks create clearly labelled deterministic investigation suggestions while their run is still running. No AI, causal diagnosis or website edit occurs. A user chooses a due date and approves a suggestion into the existing Action lifecycle. A project-local latest-50 work list shows the saved action and links back to its source check.

# Relevant areas/files

- GrowthPriorityPageCheckService: collects once, records signals, then completes its run.
- GrowthInsightsService and GrowthInsightsGraphWriter: new Insights/Recommendations require a running, same-project/same-run source graph.
- GrowthActionsService and GrowthActionsRepository: accepted recommendation, immutable creation fact, normalized target subset, due date and authenticated actor; existing replay rules.
- GrowthCheckDetail, GrowthPriorityPageChecks, GrowthPreviewPage: established saved-check and evidence flow.
- growthChangeLog server functions and GrowthChangeLog UI: project middleware, query keys, explicit retries and incumbent component patterns.

# Implementation approach

1. Add a versioned investigation template composed from the stored signal and collection snapshot key page. Persist Insight and proposed Recommendation before finishing a new check; mark analysisVersion, leave model/promptVersion null.
2. Add strict project-scoped lazy get-by-signal, approve-with-due-date, and bounded saved-work endpoints. Derive content, targets and stable action identity from the saved recommendation. Resume accepted-without-action after an interrupted approval.
3. Extend the signal detail with a native Review investigation disclosure, explicit due date and approval action. Add Work between checks and change log; a source-check link selects the correct saved run.
4. Test existing graph/lifecycle plus wrappers, auth, replay/races, SQLite persistence and rendering. Verify a synthetic approval and fresh-document read in the existing credential-free preview.

# Constraints

No dependencies, migrations, additional providers, auth/MCP changes or external writes. No real-project/provider mutations. Completed checks remain immutable; old checks without suggestions show that absence rather than being backfilled. Use snapshot URLs, normalized persisted targets and safe display URLs, even if current key pages are later removed.

Template policy: investigation only; cause unknown. Required bands use explicit conservative v1 placeholders (impact/effort/urgency 1, commercial relevance snapshot weight or 1, confidence 0 for unresolved interpretation). Do not present these as calibrated estimates. No score or promised gain appears in UI. Use a versioned template provenance and stable per-signal keys.

# Explicit non-goals

AI generation, automated approval, dismiss/snooze/merge, assignment, action status editing, implementation/change linking, measurement, scheduling, reporting, cross-check recommendation dedupe or a redesigned Growth page. The initial guarantee is one action per saved suggestion, not one action per URL across all checks; say so in the UI.

# Risks

Creation must precede run completion. Partial pipeline failure must not be misreported as Google failure. Separate acceptance/action transactions must recover safely. Retry must not change due date or actor facts or create another action. A concurrent approver may produce an explicit conflict/already-saved result, never overwrite history. No read endpoint may call a provider or create state.

# Verification plan

Director-run focused Vitest regressions including real SQLite; pnpm ci:check; pnpm build; git diff --check. Browser: proposal and due-date validation; approval survives reload; source-check link works; 390px layout. One fresh engineering review and one fresh rendered UI review, capped repairs. No live Postgres/provider claim without execution.
