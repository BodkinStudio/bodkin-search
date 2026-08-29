# Bodkin Growth - Vision

## One-line definition

**Bodkin Growth is a continuous organic-growth operating system for websites Bodkin manages.**

It combines trustworthy search evidence, Bodkin/Sherpa business context, structured recommendations, delivery tracking and outcome measurement.

---

# 1. Why this should exist

Bodkin increasingly designs, builds and operates websites rather than simply handing over static launch projects.

SEO fits naturally into that model, but traditional SEO tooling creates a gap:

- data tools show metrics;
- reports describe the past;
- project-management tools track tasks;
- designers/developers implement changes;
- analytics tools measure outcomes;
- no single system preserves the chain connecting them.

Bodkin Growth should preserve that chain.

```text
Why did we change this?
        ↓
What evidence supported it?
        ↓
What exactly changed?
        ↓
When did it change?
        ↓
What happened afterwards?
```

That is the product.

---

# 2. Product vision

Every Bodkin-managed website should have a persistent organic-growth model attached to it.

The system should understand:

## The business

Through project configuration and eventually Sherpa:

- products/services;
- commercial priorities;
- audiences;
- markets;
- differentiators;
- key pages;
- conversion goals.

## Search performance

Through OpenSEO and first-party sources:

- queries;
- pages;
- clicks;
- impressions;
- rankings;
- CTR;
- indexability;
- backlinks;
- audits;
- competitors;
- AI visibility.

## Work

Through Growth:

- recommendations;
- decisions;
- owners;
- status;
- implementation;
- change history.

## Outcomes

Through Growth and analytics:

- what changed afterwards;
- how performance compared with baseline;
- whether the result appears positive, neutral, negative or inconclusive.

Over time, the combination becomes more valuable than any single SEO dataset.

---

# 3. The core loop

```text
UNDERSTAND
business + site + priorities
        ↓
OBSERVE
search + technical + competitor evidence
        ↓
DETECT
meaningful signals
        ↓
INTERPRET
bounded, evidence-based hypotheses
        ↓
RECOMMEND
specific next actions
        ↓
DECIDE
human approval / dismissal / snooze
        ↓
DELIVER
design, content, development
        ↓
RECORD
what changed and when
        ↓
MEASURE
compare against sensible baselines
        ↓
LEARN
improve future prioritisation
        ↺
```

---

# 4. The user promise

For the Bodkin team:

> **Tell me what matters, why it matters, what we should do, and whether our previous work helped.**

For a client:

> **Show me what Bodkin found, what Bodkin did, what changed afterwards, and what happens next.**

For Sherpa:

> **Give me structured search evidence I can use while planning, designing, writing and reviewing this website.**

---

# 5. What makes it different

## 5.1 It is delivery-aware

Most SEO tools stop at recommendations.

Growth follows work through implementation and measurement.

## 5.2 It is business-aware

A keyword is not valuable merely because it has volume.

Recommendations should account for:

- service value;
- target market;
- strategic priority;
- conversion potential;
- brand relevance.

## 5.3 It is change-aware

The system should know when meaningful website changes were made.

This helps distinguish:

- algorithm/search-market changes;
- site changes;
- content changes;
- technical changes;
- unrelated trends.

## 5.4 It is agent-readable

The same evidence visible in the UI should be available through MCP.

SEO should be accessible while work is being created, not only after the fact.

## 5.5 It is evidence-preserving

Recommendations should remain explainable months later.

The system should never reduce a recommendation to:

> "AI suggested this."

---

# 6. Strategic relationship with Sherpa

The clearest long-term model is:

## Sherpa

**What is this organisation and how should it communicate/build?**

- positioning;
- audiences;
- products;
- brand;
- design system;
- content rules;
- business context.

## Growth

**How is its digital presence performing and where is the opportunity?**

- search demand;
- organic visibility;
- technical health;
- competitors;
- content gaps;
- actions;
- outcomes.

## Delivery

**What are we changing?**

- design;
- code;
- content;
- CMS;
- deployments.

Together:

```text
                  SHERPA
          organisation context
                     │
                     ▼
               DECISION LAYER
                 /       \
                /         \
               ▼           ▼
            GROWTH      DELIVERY
            observe      change
               \           /
                \         /
                 ▼       ▼
                 MEASURE
                    │
                    ▼
                   LEARN
```

Growth should not attempt to duplicate Sherpa's entire organisational model.

Instead, it should be able to consume a concise project/business context from Sherpa when available.

---

# 7. Primary users

## 7.1 Bodkin director / strategist

Needs to know:

- where opportunity is;
- which client needs attention;
- whether a proposed action is worthwhile;
- whether retainers are producing useful work.

## 7.2 Client services

Needs to know:

- what is open;
- what is blocked;
- what was completed;
- what will be reported;
- what should happen next.

## 7.3 Designer / writer / developer

Needs page-level context:

- how important this page is;
- which queries/users it serves;
- what should not be broken;
- why a change has been requested.

## 7.4 Sherpa / agents

Needs structured, scoped and auditable access to:

- project context;
- performance;
- opportunities;
- actions;
- measurements.

## 7.5 Client

Later-stage user.

Needs a simple view of:

- performance;
- completed work;
- measured outcomes;
- priorities;
- next steps.

---

# 8. Product principles

## 8.1 Actions over dashboards

If a metric does not help someone decide or evaluate work, it is secondary.

## 8.2 Evidence before prose

Generate structured facts first. Narrative comes afterwards.

## 8.3 Deterministic before probabilistic

Calculate what can be calculated. Use AI where judgement or synthesis is required.

## 8.4 Few useful recommendations beat many technically correct recommendations

The system should aggressively suppress low-value noise.

## 8.5 Commercial relevance matters

Search opportunity is not the same as business opportunity.

## 8.6 Human control over consequential changes

Automatic analysis is encouraged. Automatic publishing is not an MVP goal.

## 8.7 Measurement without fake certainty

Report evidence of improvement without pretending to have perfect causal attribution.

## 8.8 History is a feature

Do not overwrite the reason a decision was made.

## 8.9 Use OpenSEO rather than rebuilding OpenSEO

Growth should extend the base product instead of copying it.

## 8.10 Upstream-friendly engineering

Avoid unnecessary divergence from OpenSEO's conventions and architecture.

---

# 9. Non-goals

The initial product is not:

- a replacement for Ahrefs/Semrush in every workflow;
- a mass content generator;
- an autonomous SEO publisher;
- a generic project-management product;
- a generic analytics product;
- a public multi-tenant SaaS;
- a black-box "SEO score";
- a promise of exact SEO attribution;
- a reason to rebuild existing OpenSEO features.

---

# 10. Service proposition

Growth should underpin Bodkin's SEO/continuous-optimisation retainers.

Possible commercial framing:

## Monitor

- ongoing data collection;
- meaningful alerts;
- monthly review;
- prioritised recommendations.

## Growth

- Monitor;
- strategy;
- an agreed implementation allocation;
- content/technical improvements;
- measurement.

## Continuous Growth

- Growth;
- deeper experimentation;
- design/development capacity;
- content systems;
- Sherpa-assisted workflows;
- proactive optimisation.

The client pays for Bodkin's judgement and implementation.

Growth makes those services more consistent, visible and scalable.

---

# 11. Website positioning

The public proposition should be about the service, not the software.

Suggested direction:

> **Continuous organic optimisation**
>
> Launch is the beginning of the operating phase. We monitor how your site performs in search, identify meaningful opportunities and risks, prioritise improvements, implement them, and measure what changes afterwards.

The interface can be shown as evidence that the process is real.

Avoid positioning Bodkin as a new SEO SaaS vendor unless that becomes an intentional future business.

---

# 12. Long-term product moat

The long-term value is not access to DataForSEO or GSC.

Those are commodities.

The differentiated dataset is:

```text
business context
+ search evidence
+ recommendation history
+ Bodkin decisions
+ implementation history
+ measured outcomes
```

Eventually this can answer questions such as:

- Which types of SEO work tend to help this client?
- Which types of opportunities does Bodkin consistently dismiss?
- Which page clusters respond to refreshes?
- How much effort do certain recommendation types typically require?
- Which recommendations have repeatedly produced no useful signal?

That history can improve future prioritisation.

---

# 13. Desired future experience

A strategist opens a client project and sees:

> **What needs attention**
>
> 2 high-confidence risks
> 4 worthwhile opportunities
> 3 actions awaiting measurement

They open one opportunity:

> `/education` has gained impressions but CTR has fallen. Three queries now sit between positions 5 and 9. Search demand is stable. Two competing pages changed substantially this month.

The system proposes:

> Refresh the page's opening structure around university/school intent, test a more specific title, and add internal links from two high-authority case studies.

The strategist approves it.

Sherpa can now retrieve the Action while designing the page.

When a deployment is recorded, Growth starts a measurement window.

At the next report:

> The page gained 24% clicks after implementation while the surrounding topic cluster gained 7%. Position improved on five tracked terms. Result: positive signal.

The recommendation, implementation and result remain permanently linked.

That is the target experience.
