# Competitor research across Bodkin

## Product purpose

Saved competitors should help answer three questions: where do they earn relevant search visibility, what do their winning pages do, and which opportunities deserve our time? Rankings are evidence to investigate, not automatic recommendations.

## Implementation milestone

One saved competitor → a bounded keyword comparison → selected terms → Saved Keywords / Rank Tracking or an editable AI analysis draft.

| Surface             | Behavior in this milestone                                                                                                                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project memory      | Each saved competitor links to research with that domain selected. Existing notes remain available to AI chat.                                                                                                                                                                                                        |
| Research navigation | Competitor Research is a dedicated entry. Pick a saved competitor, search market and optional topic phrase, then explicitly run the comparison.                                                                                                                                                                       |
| Keyword comparison  | Filter the competitor keyword corpus by topic when supplied, then read up to 50 keywords ordered by estimated traffic; query the project's reported rankings for those exact terms. Show both ranks, ranking pages, estimated volume, retrieval time and coverage limits. Filter terms and observed competitor leads. |
| Saved Keywords      | Explicitly selected terms retain the report's country/language and available metrics, with the `competitor-research` tag appended. Existing tags are preserved.                                                                                                                                                       |
| Rank Tracking       | Continue through Saved Keywords → Track keywords; existing configuration selection and cost review apply. Saving alone does not enable recurring tracking.                                                                                                                                                            |
| AI chat             | Select up to ten terms and open a new conversation with an editable, unsent evidence draft. It asks for commercial fit, branded/irrelevant-term separation, page inspection, cited proposals and measurement ideas. The user sends it explicitly.                                                                     |
| Domain research     | Open the competitor in the existing domain keyword/page workflow for further paid research.                                                                                                                                                                                                                           |
| Growth              | A research link connects the opportunity-review screen to competitor research. No ranking difference is automatically promoted into a Signal, Recommendation or Action.                                                                                                                                               |

## Evidence and cost rules

Comparisons make at most two metered DataForSEO requests on a cache miss and reuse an organization/project/target/market-scoped cache for 12 hours. There is no automatic request on page load and no automatic recurring scan. A numerical cost estimate is not claimed where the existing interface cannot reliably quote it.

The report is a bounded provider sample, not exhaustive keyword coverage. Missing or truncated matches stay unknown; they do not mean position zero or prove that a site does not rank. Retrieval time is not the provider's ranking observation time. Different market settings do not constitute a before/after comparison.

Only saved competitors from the authorized project can be compared. Domain URLs are normalized and report links accept HTTP(S) only. AI handoff evidence is marked as untrusted source data. Opening its draft does not call the model, publish content or create work.

## Follow-on milestones

These need separate evidence/persistence work and are not claimed by the current implementation:

1. **Saved comparison history:** normalized research snapshots with explicit links from selected keywords to the source comparison; reopen and compare without relying on cache or chat history.
2. **Evidence-backed Growth proposals:** attach a reviewed competitor finding to a saved investigation, with business-fit reasoning, the relevant existing page and source snapshot before approval.
3. **Broader competitive analysis:** compare content themes, winning pages and backlink opportunities across selected competitors, with a bounded cost preview for each research job.
4. **AI visibility:** use saved competitors as an explicit selection in Brand Lookup and link cited Prompt Explorer comparisons to the same investigation workflow.
5. **Measured follow-up and reporting:** track chosen terms, record actual content changes and report outcomes with confounders and non-causal language. Scheduled competitor scans remain opt-in future work.

The existing live AI-usefulness and detector-quality gates remain in force. This research workflow does not declare those gates passed.
