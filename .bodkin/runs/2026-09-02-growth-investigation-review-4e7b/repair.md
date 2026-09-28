# Repair round 1

The first live PostgreSQL run exposed an incomplete test fixture: the seeded
Recommendation had no saved step, so both successful review transitions failed
only while parsing their returned safe view. The fixture now seeds the complete
supported investigation graph. The same migrated disposable PostgreSQL 16
fixture then passed all seven tests, including approval versus dismissal,
approval versus snooze and snoozed Review now.

Fresh adversarial review found one client recovery defect. A definitive snooze
`VALIDATION_ERROR` could freeze a date that had crossed UTC midnight. The client
now clears only that definitively rejected review payload, shows safe correction
copy and permits a new future date. Conflicts, internal failures and uncertain
transport outcomes continue to freeze and retry the exact original payload.

One test-only unused import found by targeted type-aware lint was removed. No
server authorization, state transition, CAS, Action writer or provider behavior
changed during repair.
