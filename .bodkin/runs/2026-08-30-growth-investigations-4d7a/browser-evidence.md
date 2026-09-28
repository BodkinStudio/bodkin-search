# Browser and persistence evidence

The Director tested the local-only, credential-free preview at `http://127.0.0.1:3218/p/growth-check-qa/growth`. Project `growth-check-qa` is labelled QA synthetic data and uses `example.com`. No live website or provider data was changed.

- A synthetic GSC fixture passed through the real collector, detector and Growth services to create run `c15d0de0-0ab4-4c2e-8c40-4c6514cd49d6`, signal `18149f715a8adced5189d19fc44ac5b2aed8` and saved proposal `21163e4a-8c0b-4b98-bc0d-d7c52ed971c5`.
- The real interface displayed saved facts (308 baseline clicks; 140 current), unknown cause, rule-based provenance, target URL, three investigation steps, explicit date field and approval control.
- An empty submit at 390px app width showed the linked “Choose a due date” error without creating an action.
- The initial real approval exposed a malformed repository query. Its error state kept the submitted date frozen and offered explicit recovery. After the repair hot-reloaded the preview, no action was automatically submitted. The accepted-without-action state was shown on reopening the proposal.
- Before resubmission, the browser safety check required resolving an apparent source mismatch. A fresh full snapshot and explicit `aria-pressed` check verified the selected source was the new completed 30 August, 11:16:51 UTC synthetic check, not an older check.
- Explicit UI approval with 4 September 2026 created action `b10facce-0df9-4a4c-a363-de2e3b8886e2`. Direct SQLite inspection confirmed status `approved`, due date `2026-09-04T00:00:00.000Z`, exactly one creation event attributed to `local-admin`, and no GSC connection remaining.
- A fresh document load in the 390×640 QA iframe read the same saved work and date without response overrides. Its “Open source check” link selected the correct completed run and loaded the 308/140 saved evidence; `aria-pressed` was true for that exact run.
- Desktop and 390px screenshots are listed in `.bodkin-ui/current/screenshots/manifest.json`. The existing Change log is preserved below Work. QA files and screenshots stay ignored; the evidence description is versioned here.

The real-D1 diagnostic was also rerun against a separate snapshot copy of this synthetic database: pass. Remote bindings and environment-file loading were disabled. Its first sandbox attempt could not bind loopback; the same bounded command passed after loopback permission. No live Postgres or provider-call result is claimed.

The Impeccable changed-UI detector ran once on the six changed UI components and returned no findings. The final repository verification passed 172 focused tests (six optional Postgres tests skipped), `pnpm ci:check`, the production build and `git diff --check`. Artifact-only preflight refreshes the finished screenshot manifest after the mechanical checks; it does not replace or rerun those checks.
