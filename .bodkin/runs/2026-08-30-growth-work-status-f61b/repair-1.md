# Repair 1: preview test boundary

The Director's broader Growth run passed 142 tests but failed to load the existing preview-render suite: its server-function mocks did not include the newly imported `growthWork` module, so Node tried to import `cloudflare:workers` through the server database provider. The production boundary is unchanged; this is a missing test mock. Add the new server-function mock alongside the existing ones, then repeat the focused Growth regressions. Seven optional Postgres cases were skipped because the disposable Docker service did not become available.

Earlier file-scoped UI lint found two unsafe test-harness types. Those were corrected during implementation; the focused UI tests and that lint check passed before this independent gate.
