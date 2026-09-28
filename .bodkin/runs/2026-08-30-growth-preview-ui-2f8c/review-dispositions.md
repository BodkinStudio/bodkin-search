# Review 1 dispositions

- **Valid — launcher copies arbitrary untracked files.** Restrict the snapshot to Git-tracked paths and a source/asset extension allowlist. Stage only this checkpoint's new application files with intent-to-add for pre-commit preview verification. Add explicit secret-file exclusion cases. This avoids a permanent hardcoded list of Growth source files.
- **Invalid — project switch retains preview state.** `src/routes/_project/p/$projectId/growth.tsx` renders `<GrowthPreviewPage key={projectId} projectId={projectId} />`; changing project therefore remounts the page and nested workspace. Add a route-registration regression test to make this existing reset boundary explicit. No second reset effect or redundant key is needed.
- **Valid — interactive verification gaps.** Eight Vite `full-reload` messages were independently observed on the disposable server in 30 seconds (07:11:37–07:12:07 UTC). Earlier browser-host attribution was only a hypothesis. Diagnose and repair the development-server reload cause, then repeat final-source interaction checks and captures. Do not count contradictory captures as evidence.
- **Valid — visual review missing mobile/state/provenance evidence.** Supply the final-source narrow layout, selection/return, all-pages, empty/reset, request states and expanded lower evidence. Retain the reviewer-protected sample disclosure, unknown-not-zero treatment, date-labelled metrics, focus indication and incumbent OpenSEO style.

Repair round 1 is scoped to launcher isolation/reliability, an existing route-key regression test and completion of verification evidence. Do not change authentication, persistence, detector/packet semantics, providers or dependencies.

## Repair evidence

- The source copy now uses `git ls-files --cached -z`, explicit source/asset extensions and regular in-repository files. A temporary Git repository test confirms untracked `.ts`/`.png` and disallowed tracked text/JSON are excluded.
- The reload cause was Tailwind scanning temporary database/registry files because the launcher omitted `.gitignore`. The launcher now preserves that file and appends runtime exclusions only in the disposable snapshot. An actual Tailwind scanner regression test excludes those runtime files without needing `.git`; independent live observation recorded zero full reloads in 30 seconds after repair.
- `GrowthPreviewScope.test.ts` proves the existing route changes both the component key and projectId prop when the route scope changes. No redundant production reset logic was added.
- Final focused tests pass (17), launcher tests pass (5), and the final full suite passes (1642; 11 Postgres-only skips).
- `browser-verification.md` and the final screenshot manifest provide mobile selection/return, all six outcomes, empty/reset, known-unflagged and unknown data, context/history, expanded provenance and delayed/error/retry evidence. Temporary request-state faults were confined to the disposable snapshot and restored byte-for-byte afterward.
- Full keyboard-only traversal is not claimed: native controls and focus transfer are verified, but synthetic Tab/Enter did not reliably trigger browser default actions. This limitation is explicit rather than treated as a passed keyboard interaction.

Both second reviews returned pass with no remaining findings. The independent criterion-level evidence audit returned PASS. Director acceptance and the exact remaining scope/testing limits are recorded in `acceptance-audit.md`.
