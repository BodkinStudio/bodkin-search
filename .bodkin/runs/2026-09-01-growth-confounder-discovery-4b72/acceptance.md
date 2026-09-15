# Required behaviour

1. An active Measurement Plan exposes possible confounding Change Events from
   the same project without provider calls or writes.
2. Candidate scope is derived server-side from frozen URL Metrics and the
   inclusive comparison interval from baseline start through the primary or
   configured long-term end. Client input cannot supply URLs, dates, Plan IDs or
   project identity.
3. The selected implementation anchor Event is excluded by identity. Other
   Events at the same timestamp remain eligible.
4. Every Change Event source is considered. A candidate requires at least one
   exact stored Event URL equal to a frozen Measurement URL; URL normalization,
   root wildcards and inferred site/template scope are not used.
5. Candidate ordering and matched-page ordering are deterministic. No more than
   50 complete candidates are exposed; 51 or more produces an explicit overflow
   state and no misleading partial candidate set.
6. The read model distinguishes `none`, `complete`, `overflow`, `unavailable`
   and `closed` and states that candidates are possible context, not proof that
   they affected the comparison. An empty complete set does not claim that no
   confounders exist. A legacy Plan without a selected anchor is unavailable
   rather than guessing which Event to exclude.
7. Candidate descriptions, dates, types and matched pages are safely projected;
   credential material is withheld and query/fragment omission remains a display
   limitation rather than a change to exact matching.
8. Completed/legacy result rendering remains stable. This slice never creates a
   Measurement Result, assigns outcome/confidence, selects persisted
   confounders, or transitions Work from Measuring to Evaluated.
9. Existing collection, observed comparison, start/retry and project-tenancy
   behaviour remain unchanged.

# Required checks

- Repository/service tests cover same-project filtering, foreign-project
  exclusion, anchor exclusion, same-timestamp inclusion, all Event sources,
  exact and variant URLs, inclusive start/end boundaries, deterministic order,
  no matches and overflow.
- Work read-model/server-render tests cover active candidates, none, overflow,
  closed results, safe text/URLs, plain-language limitations and no provider call
  on read/render.
- `pnpm ci:check`, `pnpm test:ci`, `pnpm build`, `git diff --check` and staged
  whitespace pass.
- A fresh reviewer returns pass or every valid finding is repaired, reverified
  and re-reviewed within two rounds.

# Regression constraints

No schema, dependency, auth, GSC, Action transition, Measurement persistence,
MCP, scheduling or unrelated UI behaviour changes.

# Important edge cases

- An Event exactly at baseline start or the final period's last UTC instant.
- Another Event sharing the anchor timestamp but not its ID.
- One Event matching several frozen URLs and one URL shared by several Events.
- Query/trailing-slash variants, root URLs and template/migration descriptions.
- More than 50 matches, deleted/missing anchor graphs and a completed Plan.

# Product / UX requirements

- Keep the existing compact Work measurement disclosure and semantic heading
  order.
- Use `Possible confounding changes`; do not label candidates as proven
  confounders.
- Render a semantic list or table with explicit headers, safe wrapping and
  non-colour-only empty/overflow states.
- State both limitations: exact URL/time discovery can miss site-wide effects,
  and no recorded candidates does not prove the comparison was unaffected.

# Specialist review requirements

- UI work follows the repository UI routing process; the router CLI was
  unavailable, so the narrow accessibility guidance applies.
- Browser evidence is waived only because of the user's explicit restriction;
  server-render tests must provide mechanical UI evidence.
- Fresh review must challenge tenancy, completeness/overflow, exact matching,
  temporal boundaries, safe projection and non-causal wording.
