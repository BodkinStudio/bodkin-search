# YakChat Teams SMS: evidence and decision record

Revised 8 September 2026 after review. Draft only; no website change approved. This replaces the earlier general optimisation proposal.

The evidence supports a small factual correction and further investigation. It does not establish that the article needs a broad rewrite, that its current copy caused low clicks, or that Teams is the highest-return project opportunity.

## What the performance evidence establishes

Source: connected Search Console property `https://www.yakchat.com/`, final web data, 9 August–5 September 2026, Pacific dates, all devices. Exact article URL: `https://www.yakchat.com/posts/microsoft-adds-sms-to-teams`.

| Observation                                                                       | Scope                                                    | Interpretation                                        | What it does not establish                                               |
| --------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Article: 1,937 impressions, 0 clicks, average position 13.75                      | USA, page totals, earlier saved baseline                 | The article has search visibility worth investigating | Why searchers did not click, or whether rewriting would help             |
| `microsoft teams sms`: 352 impressions, 0 clicks, average position 9.45           | USA, exact article, query read rechecked 8 September     | A relevant broad query already exposes this article   | Commercial intent, conversion potential, or poor title quality           |
| `microsoft teams sms messaging`: 26 impressions, 0 clicks, average position 13.62 | USA, exact article, same query read                      | A small US sample                                     | Enough evidence for an uplift promise                                    |
| Saved detector: the latter query has 54 impressions and average position 14.83    | All countries, rechecked separately                      | Explains why the detector differs from the US read    | A US-specific recommendation; the saved detector does not filter country |
| Product page: 8 clicks, 1,466 impressions, average position 7.53                  | USA, exact canonical product URL, earlier saved baseline | The product page is receiving search traffic          | A missing link or cannibalisation between pages                          |

The 134 returned US query rows had no further API page. Query reporting can still omit anonymised searches; query totals need not equal page totals. Impressions are not unique people. Average position is not a fixed desktop rank. The earlier 356-impression figure used 8 August–4 September; use 352 for the aligned window above.

Baseline record: [saved analytics evidence](../../.bodkin/runs/2026-09-08-teams-draft/baseline.json). Fresh query extract: [US query response](yakchat-teams-query-evidence-2026-09-08.json). Reproduce in GSC with the dates, page, country and query filters above.

## Decisions and reasons

### 1. Propose a billing-unit correction — supported

Evidence: the article's overage section describes charges per SMS. Microsoft documents per-message-segment charging; longer messages can consume multiple segments. Sources checked 8 September: [article](https://www.yakchat.com/posts/microsoft-adds-sms-to-teams), [Microsoft pricing explanation](https://learn.microsoft.com/en-us/microsoftteams/sms-overview#sms-message-segments-and-thresholds).

Reason: an ambiguous unit can mislead a buyer estimating cost. Confidence is high in the documented unit; any traffic or conversion benefit is unproven.

Proposed copy: “Usage charges apply per message segment sent or received. A longer message can contain multiple segments. Check Microsoft's current plan allowances and applicable carrier charges.” Link the explanation to Microsoft's documentation. Product-owner review should confirm the wording in context before publication. Success for this correction means accurate, traceable wording—not a ranking increase.

### 2. Withdraw the additions previously suggested — counterevidence

The article already contains licensing guidance and a contextual link to the Teams product page. That contradicts treating them as missing. [Inspect the existing article](https://www.yakchat.com/posts/microsoft-adds-sms-to-teams).

Do not add duplicate sections or links. Changing placement or wording remains a hypothesis requiring a specific usability or intent problem to be demonstrated first. No click-path or usability evidence was collected.

### 3. Hold the broad rewrite — insufficient evidence

The analytics above identify exposure without clicks. They do not diagnose copy, snippet, intent, device mix or competition. Before proposing a title/opening rewrite, inspect the actual US results on desktop and mobile for the named query; record competing URLs, result types and the displayed YakChat snippet. Neither that comparison nor a user test has been completed here.

Only proceed if that investigation identifies a concrete mismatch and explains why the proposed wording addresses it. If the result presentation is already appropriate, leave it alone. No target uplift or industry CTR benchmark has been justified.

### 4. Validate conversion measurement before claiming business value

The earlier GA4 organic landing-page report returned 29 product-page sessions and 2 article sessions, with zero recorded key events, for 9 August–5 September, all countries, Etc/GMT. It is not geographically comparable with US-only GSC. The trial key event was created on 1 September, partway through the baseline.

Reason: zero recorded events cannot distinguish no leads from incomplete tracking. Agree whether a completed demo booking or completed trial is the primary outcome, test the full event path, and check attribution. Until then, business value remains unknown; do not justify a rewrite by claiming these visits fail to convert.

## What approval would mean

Approve only the specific billing clarification after checking its sources and exact copy. The broader rewrite and link changes are on hold. An accuracy correction can proceed without pretending it is a validated growth experiment.

If a later evidence-backed optimisation is published, capture the preceding 28 complete days again and compare a full 28 days after publication, excluding publication day. Wait at least three Pacific days for final GSC data. Keep geography, URLs and devices consistent; report absolute counts and simultaneous changes. Before/after movement alone is not causal proof and may remain inconclusive. Formal measurement begins only after a real implementation date exists.

## Standard this proposal must meet

Every proposed edit needs an observable problem, inspectable source and collection scope, a reason it matters to YakChat, an explanation of how the edit addresses that problem, counterevidence, uncertainty, and a decision or validation criterion. A citation supporting a metric does not automatically support the action attached to it.
