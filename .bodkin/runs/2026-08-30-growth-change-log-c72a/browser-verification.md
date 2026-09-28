# Manual change log: browser verification

Used the existing disposable, credential-free preview at http://127.0.0.1:3218/p/growth-check-qa/growth. Project name is QA synthetic data and all notes explicitly say no live website was edited. No real project, provider or credentials were used. Preview source matches the application changes; there are no endpoint response overrides.

- Opened Record a change. Empty submission showed linked inline errors and did not create a record.
- Selected the configured example.com/pricing page. The initial smoke test exposed a visible-date/form-state mismatch; repair-1.md records the correction.
- After the correction, filled the date with 2026-08-29, selected Title or meta description updated, entered a clearly synthetic note and submitted. The API saved the entry, closed the form and showed Changed 29 Aug 2026 separately from Manually recorded 30 Aug 2026.
- Loaded a fresh app document inside the QA iframe. Both saved entries came from the disposable DB, including the exact 29 August date. No automatic resubmission occurred.
- Checked the same UI at 390px CSS app width. Controls stack, notes wrap, Save change remains accessible by scrolling, and empty-submit errors are visible next to their fields. The viewport is a labelled 390x640 iframe inside the ordinary 1280x720 browser, not a native-device emulation. Upper and lower captures show the naturally scrolling form.
- Kept the incumbent DataForSEO setup banner unchanged; it does not block this database-only workflow. The GSC Run check remains disabled without a connection.
- Impeccable's changed-UI detector returned an empty finding list. No new visual system, imagery, animation or dependencies were added.
- The independent rendered review flagged faint validation text. Both affected narrow captures were replaced after the scoped theme-token contrast correction; the second fresh UI review passed. No global theme or form behavior changed in that correction.

Rendered review evidence is listed in .bodkin-ui/current/screenshots/manifest.json. The first synthetic note remains in the disposable QA database; it is not used as proof of the corrected date flow. Non-default browser zoom/device behavior and live Postgres were not verified. Optional Postgres tests remain gated by the repository's TEST_POSTGRES_DATABASE_URL configuration.
