# Accepted follow-up

The authorized reliability follow-up is complete. The earlier investigation/work slice can now be committed with this fix. The prior run remains an accurate escalated record; its findings are resolved here, not erased.

Approval composes the existing Action writer and recommendation compare-and-set in one `runBatch`. It locks proposed sources for update on Postgres, creates the Action, normalized targets and creation event first, then accepts only when this invocation's complete graph exists. Stale versions and occupied keys cannot accept another graph. Constraint failure rolls back the proposal and every Action row. Generic accepted-only Action creation remains intact.

Saved-action replay validates immutable facts using the original creation-event actor and due date. Concurrent same-date approvals reuse one saved result; another date conflicts. Approval versus dismissal saves one decision. Legacy accepted-without-action records remain readonly conflicts because their original approval details are unavailable. The UI removes their retry form and explains the review requirement. Work remains project-scoped, bounded and deduplicated.

The Director executed 190 passing regressions across 33 files, including the new and existing Postgres tests. The real D1 rollback/replay probe passed. The five Postgres tests passed again after test-only lint cleanup. Full repository CI and the production build passed. `verification.json` consolidates those actual results; the earlier failures and narrow corrections remain recorded. The production bundle was not rebuilt after test-only edits. Its existing large-chunk warning is unchanged.

Fresh independent repair review passed with no findings or gaps. It accepted the static-render evidence for the native-text-only recovery branch, given the disclosed browser URL-policy denial. No new browser screenshots or interaction success are claimed. Previous visual evidence applies only to the unchanged layout. Live Google collection and usefulness on a real site remain outside this synthetic reliability verification.

No application schema, dependency, auth, MCP, shared database helper or review-control configuration changed. The existing Greptile atomic-write rule covers the invariant; no new rule was needed. The organization-level review baseline was not verified or modified in this local follow-up.
