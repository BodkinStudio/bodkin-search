# LinkedIn and YouTube analytics roadmap plan

Status: active roadmap; YouTube connection and channel overview implemented

## Implemented first slice

The delivered YouTube foundation uses a separate read-only OAuth grant, channel discovery, and one selected channel per project. The channel overview uses `youtube.readonly` and `yt-analytics.readonly` to compare current channel metrics with the preceding period of the same length in the dashboard and MCP. Video performance, traffic sources, and LinkedIn remain planned work.

## Decisions

YouTube now supports a read-only channel overview through self-hosted OAuth. LinkedIn Page analytics is the next integration milestone; development can proceed while production rollout remains dependent on LinkedIn approval.

## Product goal

Let a project connect the channels where its content is published, inspect performance in OpenSEO, and give agents the same read-only evidence through MCP.

The first release should answer a small set of questions:

- Which videos or posts are earning attention?
- Is reach, engagement, or audience growth improving?
- Which topics and formats deserve another piece of content?
- Where tagged links are available, did that attention lead to useful website traffic in GA4?

This work should extend OpenSEO's first-party analytics model. It should not become a social publishing or community-management product.

## Recommended public roadmap placement

Add these items under **Soon**:

```md
- YouTube Analytics integration
  - Channel and video performance in OpenSEO and MCP.
- LinkedIn Page analytics
  - Follower, visitor, and post performance.
  - Timing depends on LinkedIn API approval.
```

Use "LinkedIn Page analytics" rather than the broader "LinkedIn analytics" until the team decides whether personal profile and member post analytics belong in the product. The Page use case maps more directly to a project and carries fewer product and privacy ambiguities.

## Delivery order

Ship YouTube first. Start LinkedIn's access application at the same time, since approval is an external dependency.

YouTube can reuse the current Google OAuth and GA4 integration shape. LinkedIn requires a vetted Community Management application, a development tier before production access, and a later standard-tier review. The public roadmap should describe the LinkedIn outcome without promising a date that depends on approval.

## Three-month plan

### Weeks 1 and 2: decisions and provider access

- Confirm that the LinkedIn MVP covers company Pages, not personal profiles or ads.
- Create and verify the LinkedIn developer application, request Community Management development access, and record the standard-tier review requirements.
- Enable the YouTube Data API and YouTube Analytics API in the hosted Google project.
- Request only read-only YouTube scopes. Leave revenue and ad-performance scopes out of the MVP.
- Confirm the Google verification work caused by adding YouTube scopes.
- Define provider data retention, deletion, disconnect, and GDPR erasure behavior before adding tables.
- Update the privacy-policy draft for both providers, but publish it with the integrations rather than before them exist.

Gate: the team has a working YouTube test grant and either LinkedIn development access or a recorded approval blocker.

### Weeks 2 to 5: YouTube vertical slice

- Add a dedicated YouTube OAuth grant and project connection. A project selects one channel for the MVP.
- Add channel discovery through the YouTube Data API.
- Add a typed, Zod-validated YouTube client and reporting service.
- Show a connection card in project settings using the existing integration card shell.
- Add one dashboard card with a current-period and previous-period comparison.
- Add three MCP tools:
  - `get_youtube_channel_overview`
  - `get_youtube_video_performance`
  - `get_youtube_traffic_sources`
- Document hosted and self-hosted setup.

The MVP report should include views, watch time, average view duration, subscribers gained and lost, likes, comments, shares, top videos, and traffic sources. Return provider freshness and missing-row warnings rather than filling unknown data silently.

Gate: a user can connect a channel, retrieve the same bounded report in the app and MCP, switch channel, disconnect, and recover from an expired grant.

### Weeks 4 to 8: LinkedIn Page analytics vertical slice

- Build and test against the development tier with fixture-backed tests for rate-limit and approval-independent work.
- Add a separate LinkedIn OAuth provider and callback. Do not put LinkedIn behavior into the Google OAuth module.
- Discover Pages administered by the member and let a project select one Page.
- Add a typed LinkedIn client with an explicit API-version header and a scheduled version-review date.
- Add Page overview and post-performance services.
- Show a LinkedIn connection card in project settings and a Page-performance dashboard card.
- Add two MCP tools:
  - `get_linkedin_page_overview`
  - `get_linkedin_post_performance`
- Store or cache only Page-level reporting aggregates needed to stay within provider limits. Do not persist member profiles, comments, or other member-level activity in the analytics MVP.
- Prepare the standard-tier screencast and review pack from the working product.

The MVP should include follower totals and change, Page views and clicks, post impressions or reach, reactions, comments, reshares, link clicks when available, and the best-performing posts for the chosen period.

Gate: the development-tier integration works end to end and the standard-tier application has been submitted. Production rollout remains behind a feature flag until LinkedIn approves it.

### Weeks 8 to 10: content performance view

- Add a project-level content performance view that keeps provider-native metrics labelled clearly.
- Use the same date-range and previous-period controls for both providers where their APIs permit it.
- Rank content within each provider. Do not combine views, impressions, reactions, and watch time into a synthetic cross-platform score.
- Link tagged content to GA4 landing-page outcomes when a reliable URL or UTM value is present.
- Include source, timezone, freshness, completeness, and comparison-period metadata in every report.

Gate: users can move from a top post or video to its available website outcome without OpenSEO claiming causation from a correlation.

### Weeks 10 to 12: launch and growth workflows

- Add provider evidence to custom and scheduled reports.
- Teach the in-app agent which MCP tool to use for channel, content, and traffic-source questions.
- Add one narrow recommendation workflow, such as finding a high-retention YouTube video whose topic has no matching priority page.
- Complete disconnect, revocation, token-expiry, retention, and user-erasure checks.
- Run the full SQLite and Postgres schema-parity checks, CI, production build, and provider sandbox tests.
- Roll out YouTube independently. Roll out LinkedIn only after standard-tier approval.

Gate: each provider can launch or remain disabled without breaking the other provider or the existing GSC and GA4 integrations.

## MVP boundaries

Include:

- Read-only analytics.
- One selected YouTube channel and one selected LinkedIn Page per project.
- Current-period and previous-period reporting.
- Top-content tables and bounded MCP responses.
- Hosted and self-hosted connection instructions.
- GA4 joins only when content contains a reliable tagged destination URL.

Defer:

- Publishing, scheduling, comments, mentions, inbox, or moderation.
- LinkedIn ads, lead forms, and campaign reporting.
- YouTube revenue and ad-performance metrics.
- Personal LinkedIn profile and member post analytics.
- Arbitrary cross-platform metric builders.
- A single "content score" across providers.
- Automated recommendations until the underlying reports have been used and checked by real projects.

## Architecture fit

Follow the current project-scoped integration structure:

```text
OAuth grant in Better Auth account table
  -> selected provider resource in a project connection table
  -> provider client
  -> feature service
  -> TanStack server function
  -> settings/dashboard UI and MCP tools
```

Implementation notes:

- Add matching SQLite and Postgres connection schemas and keep schema parity covered by tests.
- Keep OAuth tokens encrypted in Better Auth's `account` table. Connection tables should hold the selected channel or Page, display metadata, project and organization IDs, and the connecting account reference.
- Extend the existing Google self-hosted OAuth registry for YouTube. Give LinkedIn its own OAuth configuration and callback path.
- Keep provider clients separate because their dimensions, freshness rules, pagination, error models, and API versioning differ.
- Reuse `IntegrationConnectionCard` and the GA4 connect, select, reconnect, disconnect, and error-state behavior.
- Normalize only the small response shape needed by a shared content-performance view. Keep raw provider payloads out of application tables.
- Query YouTube reports on demand, following the current GA4 approach. Cache LinkedIn Page aggregates conservatively because the development tier has low daily request limits. Record retrieval time and expiry with every cached result.
- Treat provider data as first-party and zero-credit, matching GSC and GA4.
- Give every MCP response a bounded row count, provider metadata, warnings, and an action URL for connection failures.

## Acceptance criteria

Each integration is complete when:

- A user can connect, select, change, reconnect, and disconnect a provider resource.
- Project authorization prevents cross-project and cross-organization access.
- Disconnect and user erasure remove the project connection, tokens when no longer shared, and any provider cache covered by deletion rules.
- Expired, revoked, rate-limited, inaccessible, incomplete, and malformed provider responses produce distinct errors.
- App and MCP results use the same service and agree for the same request.
- Date ranges, timezones, comparison windows, freshness, and limited-data states are visible.
- SQLite and Postgres schemas match.
- Provider responses are validated at the HTTP boundary.
- Tests cover pagination, empty periods, partial data, rate limits, reconnect behavior, and resource access loss.
- No member-level LinkedIn data is stored or exported by the analytics feature.

## Product measures

Track these after launch:

- Connection starts and successful resource selections by provider.
- Weekly projects that read at least one provider report.
- Report and MCP success rates, split by error code.
- Reconnect and disconnect rates.
- Use of top-content and GA4-linked views.
- LinkedIn requests per app and member against the current access-tier limits.

Do not use raw views or impressions as the launch measure. A connected project that returns useful reports without repeated errors is the first signal that the integration works.

## Remaining decisions

1. May LinkedIn begin as hosted-only while its application review is completed, or must self-hosting ship at the same time?
2. Which one or two customer questions should the first agent workflow answer?

## External references

- [YouTube Analytics report queries](https://developers.google.com/youtube/analytics/reference/reports/query)
- [YouTube Analytics channel reports](https://developers.google.com/youtube/analytics/channel_reports)
- [YouTube Analytics metrics](https://developers.google.com/youtube/analytics/metrics)
- [LinkedIn Community Management overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview)
- [LinkedIn Community Management app review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review)
- [LinkedIn Marketing API data storage requirements](https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements)
