# Required behaviour

- An authorized project user opens Related page changes on a qualifying investigation and sees bounded saved links and recent manual candidate changes.
- A linked record remains visible even when older than the recent candidate list. Project/Action scoping is part of every read, including exact-ID qualification beyond the recent-50 Work list.
- An explicit save links the selected pair idempotently and shows saved state after refresh/reload. No automatic save on render, open, select, refresh or reload. Uncertain saves retry the original pair; double-clicks cannot dispatch twice. Project/Action changes do not carry local request state across identities.
- Foreign, missing or unsupported Work and missing/foreign/non-manual candidate IDs are rejected. No caller-supplied actor metadata; project identity comes from existing middleware.
- Linking preserves original event facts/hash, Action status/version/milestones and all existing associations. No URL-overlap or status restriction is introduced. No provider calls or measurement/evaluation side effects.

# Checks and UX

Focused schema/service/server-boundary, actual SQLite scoped-query tests, executed Postgres query coverage, repository CI, production bundle, whitespace and independent engineering review. Reuse incumbent list/disclosure/form patterns and native labels; show loading, error, retry, empty, saved and disabled states. Show selected record detail before save, explain append-only/no-unlink behavior and lack of causal claim, and link to the existing change log. Keep content readable on narrow screens without new fixed widths or modals.

# Specialist evidence

Material EXTEND requires fresh desktop/narrow screenshots and independent rendered review. Browser policy currently blocks capture. Static rendering tests and a clean detector are not visual acceptance; do not claim this gate passed or reuse older captures. No full Phase 2/3 gate is claimed.
