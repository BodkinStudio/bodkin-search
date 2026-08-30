# Browser verification

The local preview uses a disposable source copy and isolated D1 database on port 3218. No user credentials, project data or provider environment variables were copied. The existing port-3217 preview was left intact.

## Exercised

- Empty project: missing Search Console setup is explained; Run check is disabled; the existing integrations link has the correct project path.
- Seeded QA project: four synthetic persisted runs model completed, incomplete, failed and interrupted states. A detector-generated saved decline displays 280 baseline clicks, 112 current clicks and -60.0%.
- Opening saved evidence reads the saved numbers and capture time, shows a safe display URL, labels commercial context as current and displays all packet limitations.
- A full page navigation/reload followed by reopening the completed run preserves the same numbers and evidence, with no Search Console connection in the preview.
- An incomplete run states missing observations and explicitly refuses an all-clear; a failed run gives safe reconnection guidance; a running run states completion is unknown and offers saved-result refresh.
- The legacy fixture demonstration remains a separate, explicitly synthetic disclosure.
- Final UI repairs show each check's start timestamp, keep selection visible after focus moves, label the baseline/current count windows separately, and reuse the safe current-URL projection. Incomplete status uses the incumbent warning treatment.
- Enabled, submitting and missing-key-page renders were captured with temporary response overrides restricted to the synthetic QA project in the disposable source copy. The simulated submission made no provider call. The overrides were removed; the preview server-functions file was then byte-compared with repository source.
- Desktop and narrow app states were inspected. The narrow test renders the unmodified application in a temporary 390 × 844 iframe inside the disposable preview, not a resized native browser window.

## Limits

The saved QA rows were seeded solely for UI inspection. The real collection-to-persistence chain is separately covered by the SQLite integration test using mocked Search Console. Neither constitutes a live Google round trip. No connection, automatic job, AI recommendation or Action was created. Raw source rows and per-page suppressed outcomes are not persisted by this slice.

The repository's existing DataForSEO setup banner remains part of the upstream shell; the new check itself uses Search Console, not DataForSEO.

Rendered artifacts: `.bodkin-ui/current/screenshots/manifest.json`. Only the `live-check-*` images are evidence for this run; the incumbent screenshot is the existing-system reference.
