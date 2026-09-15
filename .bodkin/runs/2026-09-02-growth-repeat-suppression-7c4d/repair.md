# Repair round 1

Fresh implementation review found two persistence defects. First, SQL CHECK
three-valued logic allowed a suppressed ledger row with a null reason. Both
dialect schemas, generated migrations and snapshots now require
`suppression_reason IS NOT NULL` before the closed vocabulary check. The D1
migration fixture and live PostgreSQL fixture both reject the malformed row.

Second, the PostgreSQL candidate graph source checked that its Run was running
without holding that state through the later controller claim. The atomic writer
now applies the repository's established provider-gated `FOR SHARE` source
lock. A live terminal-first race proves that the terminal transition can win
without leaving an Insight, Recommendation or decision row. The existing
candidate-versus-candidate race still produces exactly one controller graph and
one suppressed decision.

Provider lifecycle evidence was expanded. The real SQLite check service now
runs two distinct checks for the same page, creates one controller and one
suppressed Signal decision, projects the latter read-only against the exact
Action and rejects approval through the suppressed Signal. A second real
SQLite scenario forces a later page's deterministic candidate to conflict after
an earlier decision commits; the Run becomes `completed_with_errors`, retains
the analysis version and keeps the committed investigation readable. Live
PostgreSQL now proves restricted controller Recommendation/Run deletion,
suppressed-Signal cleanup and successful whole-project cascade.

The second review found no code defect but correctly required the reported
verification to be durable. `verification.json` and `acceptance.md` now record
the exact commands, environments, results and evidence boundary before final
acceptance. No controller-release policy, URL similarity, provider call, AI,
scheduler, alert, Measurement, report, MCP or auth surface was added.
