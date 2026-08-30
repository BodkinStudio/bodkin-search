# Director verification findings: bounded repair 1

All findings below are valid against the existing acceptance criteria; they do not change the selected feature scope.

1. GrowthPriorityPageCheckService builds the suggestion target from the pre-collection setup keyPages, not the adapter's validated collection snapshot. If configuration changes between reads, that can attach the observation to the wrong URL or fail a valid signal. Carry snapshot.keyPages into generation and test a differing setup/snapshot URL.
2. approveInvestigation returns any action under the stable key before checking the submitted due date or recommendation relationship. Its current test explicitly accepts a changed due date, contrary to acceptance. Reject changed due dates and mismatched recommendation identity; an identical retry or another member reading the same saved action must preserve the original actor/event.
3. getWork lists every project Action although this surface's source link only understands priority-page checks. Filter to supported investigation actions and their valid source checks. Current getWork also reloads complete event graphs per row; reuse the already-selected metadata and bulk targets so listing 50 rows does not load unrelated/unbounded action history.
4. Add missing deterministic evidence for these corrections and declared boundaries: valid/invalid/forged schema inputs, unsupported/foreign sources, template bounds, bounded/scoped query shape, concurrent approval/one action, and the running-only analysis version. Existing service primitives remain authoritative; no schema or lifecycle expansion.

Keep source observations and completed runs unchanged, keep server-derived authority and stable creation facts, and retain the approved UI contract. Director will independently execute final focused checks, CI/build, and browser verification after this batch.
