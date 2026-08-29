# Bodkin Growth - Codex Planning Pack

**Status:** Recommended direction after architecture review
**Date:** 29 August 2026
**Working name:** Bodkin Growth
**Foundation:** OpenSEO

This folder is the source-of-truth planning pack for building Bodkin Growth.

Bodkin Growth is not intended to become another general-purpose SEO suite. It is an agency operating layer that turns SEO evidence into prioritised work, tracks what was implemented, and measures what happened afterwards.

The core loop is:

```text
Observe
  ↓
Detect
  ↓
Explain
  ↓
Recommend
  ↓
Approve
  ↓
Act
  ↓
Measure
  ↓
Learn
  ↺
```

## Recommended implementation direction

After reviewing the current OpenSEO codebase and product capabilities, the recommended starting architecture is:

1. Fork OpenSEO.
2. Keep the fork as close to upstream as practical.
3. Add Bodkin-specific "Growth" features as clearly isolated modules within the OpenSEO application.
4. Reuse OpenSEO's existing organisation/project tenancy, DataForSEO integrations, GSC, rank tracking, audits, snapshots, auth, workflows, MCP and UI patterns.
5. Add the missing operating layer: signals, insights, recommendations, actions, change events, measurement and reports.
6. Extend OpenSEO's existing MCP with high-level Growth tools rather than building a second MCP gateway immediately.
7. Prove the entire loop on `bodkin.studio`.
8. Add one or two retained client sites only after the system is useful internally.
9. Extract Growth into a separate service only if a real architectural reason emerges.

This is a deliberate change from an earlier concept that assumed a separate Growth application and database from the beginning. The current OpenSEO codebase already provides too much of the required substrate for that duplication to be justified.

## Reading order

1. `00_REVIEW_AND_DECISIONS.md`
   - What still holds from the original idea.
   - What changed after deeper technical review.
   - Hard decisions and open questions.

2. `01_VISION.md`
   - Product vision.
   - Service proposition.
   - Users, goals, principles and non-goals.

3. `02_PRODUCT_REQUIREMENTS.md`
   - Functional requirements.
   - Core workflows.
   - Screens.
   - Action lifecycle.
   - Reporting and measurement.

4. `03_TECHNICAL_ARCHITECTURE.md`
   - How to extend OpenSEO.
   - Data model.
   - scheduled analysis.
   - AI boundary.
   - MCP.
   - security and deployment.

5. `04_IMPLEMENTATION_PLAN.md`
   - Phases and gates.
   - Codex-sized work packages.
   - Acceptance criteria.

6. `05_ARCHITECTURE_DECISIONS.md`
   - ADR-style decisions Codex should preserve unless explicitly revisited.

7. `AGENTS_BODKIN_APPENDIX.md`
   - Bodkin-specific agent rules to append beneath upstream OpenSEO's existing `AGENTS.md` guidance.

8. `CODEX_START_PROMPT.md`
   - A practical first prompt for Codex once the fork exists.

## Important product rule

The unit of value is not a dashboard and not a monthly report.

The unit of value is a **measurable action backed by evidence**.

A recommendation should be traceable to the signals that created it. An implementation should be traceable to the recommendation. A result should be traceable to the implementation.

## MVP definition

The MVP is successful when Bodkin can use the system on `bodkin.studio` to:

- ingest trustworthy SEO evidence;
- detect a small number of material changes/opportunities;
- review an evidence-backed recommendation;
- turn it into an action;
- record a website change;
- place the action into a measurement window;
- assess the outcome without overstating causality;
- generate a useful monthly summary;
- query the same state from Sherpa or Codex through MCP.

If that loop is not useful, more dashboards, integrations and automation will not fix the product.
