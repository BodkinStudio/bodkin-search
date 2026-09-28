# Test-only lint corrections

The repository retry passed formatting, Knip and both TypeScript checks, then reported two lint errors in the new tests: a redundant array spread around toReversed(), and a locally declared predicate without a runtime scope capture. Remove the spread and capture the explicit changed-table names in the schema predicate. Runtime source and SQL are unchanged.

This uses the second repair round. Any subsequent material correctness finding must be escalated rather than starting another automatic repair.
