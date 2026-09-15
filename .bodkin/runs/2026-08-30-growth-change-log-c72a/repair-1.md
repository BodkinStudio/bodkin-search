# Date input smoke-test correction

During independent browser verification, filling the native date input displayed 29 August but submitting persisted the default 30 August. The request payload uses TanStack Form state, so visual input/state divergence is unacceptable even when exposed by browser automation.

The date field now handles the native input event directly, updating form state as the displayed date is entered. This is confined to the native date control; server validation and UTC-day persistence do not change. Repeat a dated browser submission and reload, plus focused tests and final checks. The first synthetic QA note remains explicitly synthetic and is not evidence for the corrected date behavior.

The initial full check also found two TypeScript errors in the new server-function test: synthetic trusted context was passed through a public client signature. The test now captures registered server handlers, invokes those handlers with trusted context, and asserts the project middleware registration. This is a test-only correction, without casts or application changes. Initial results are retained in verification-initial.json; final checks run again after both fixes.
