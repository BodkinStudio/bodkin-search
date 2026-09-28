# Escalation: boundary hardening after repair cap

## Trigger

The run reached `repairRound: 2`, then independent boundary inspection found
new timezone and privacy defects plus a provider-ordering risk. A third
automatic repair is prohibited.

## Evidence

- The iterative local-midnight conversion can return an instant that still
  belongs to the previous local calendar date when midnight is skipped, such as
  `Africa/Cairo` on 24 April 2026. That can misclassify overdue Actions.
- Direct URL facts strip query and fragment material but can retain an email
  address embedded in a URL path.
- SQL applies `cap + 1` before the JavaScript code-unit tie-breaker, while the
  provider's default text collation is not an explicit part of the contract.

## Chosen response

Keep this run escalated and create a separate bounded hardening run. Preserve
the accepted monthly-report product contract and change only the existing
timezone-boundary, safe-URL and deterministic-query seams, with focused
regression evidence before final review.
