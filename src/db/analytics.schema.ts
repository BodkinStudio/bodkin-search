import {
  sqliteTable,
  text,
  integer,
  check,
  index,
  unique,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./app.schema";

export const analyticsSettings = sqliteTable(
  "analytics_settings",
  {
    projectId: text("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    businessModel: text("business_model").notNull().default("organisation"),
    primaryOutcome: text("primary_outcome")
      .notNull()
      .default("registration_completed"),
    matchingWindowHours: integer("matching_window_hours").notNull().default(24),
    retentionDays: integer("retention_days").notNull().default(90),
    customerRetentionDays: integer("customer_retention_days")
      .notNull()
      .default(395),
    personalAccess: integer("personal_access", { mode: "boolean" })
      .notNull()
      .default(false),
    webhookUrl: text("webhook_url"),
    // Qualified leads a week the project is aiming for (the MQL report's target line).
    weeklyMqlTarget: integer("weekly_mql_target"),
    anonymousCollection: integer("anonymous_collection", { mode: "boolean" })
      .notNull()
      .default(false),
    updatedAt: text("updated_at").notNull(),
  },
  () => [],
);

export const analyticsSources = sqliteTable(
  "analytics_sources",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull(),
    kind: text("kind").notNull(),
    hostname: text("hostname").notNull(),
    environment: text("environment").notNull().default("production"),
    destination: text("destination").notNull().default("product"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    unique("analytics_sources_public_key").on(t.publicKey),
    unique("analytics_sources_host_env").on(
      t.projectId,
      t.hostname,
      t.environment,
    ),
  ],
);

export const analyticsActions = sqliteTable(
  "analytics_actions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    destination: text("destination").notNull(),
  },
  (t) => [
    unique("analytics_actions_action_destination").on(
      t.projectId,
      t.action,
      t.destination,
    ),
  ],
);

export const analyticsContexts = sqliteTable(
  "analytics_contexts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull(),
    contextKey: text("context_key").notNull(),
    environment: text("environment").notNull(),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    sessionId: text("session_id").notNull(),
    attributionAllowed: integer("attribution_allowed", { mode: "boolean" })
      .notNull()
      .default(false),
    identityAllowed: integer("identity_allowed", { mode: "boolean" })
      .notNull()
      .default(false),
    policyVersion: text("policy_version").notNull(),
    userIssuer: text("user_issuer"),
    userId: text("user_id"),
    customerId: text("customer_id"),
  },
  (t) => [
    unique("analytics_contexts_context").on(
      t.projectId,
      t.sourceId,
      t.contextKey,
    ),
    index("analytics_contexts_seen").on(
      t.projectId,
      t.environment,
      t.lastSeenAt,
    ),
  ],
);

export const analyticsEvents = sqliteTable(
  "analytics_events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull(),
    environment: text("environment").notNull(),
    contextId: text("context_id").notNull(),
    eventId: text("event_id").notNull(),
    sessionId: text("session_id").notNull(),
    name: text("name").notNull(),
    occurredAt: text("occurred_at").notNull(),
    receivedAt: text("received_at").notNull(),
    sequence: integer("sequence").notNull().default(0),
    pageHost: text("page_host"),
    pagePath: text("page_path"),
    referrerHost: text("referrer_host"),
    campaignSource: text("campaign_source"),
    campaignMedium: text("campaign_medium"),
    campaignName: text("campaign_name"),
    campaignContent: text("campaign_content"),
    campaignTerm: text("campaign_term"),
    referrerPath: text("referrer_path"),
    clickIdType: text("click_id_type"),
    clickId: text("click_id"),
    action: text("action"),
    destination: text("destination"),
    placement: text("placement"),
    trust: text("trust").notNull().default("public"),
    policyVersion: text("policy_version").notNull(),
  },
  (t) => [
    unique("analytics_events_event").on(t.projectId, t.eventId),
    index("analytics_events_timeline").on(
      t.projectId,
      t.contextId,
      t.receivedAt,
      t.sequence,
    ),
    index("analytics_events_period").on(
      t.projectId,
      t.environment,
      t.receivedAt,
    ),
  ],
);

export const analyticsNetworkObservations = sqliteTable(
  "analytics_network_observations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environment: text("environment").notNull(),
    eventId: text("event_id").notNull(),
    epoch: text("epoch").notNull(),
    networkKey: text("network_key").notNull(),
    family: text("family").notNull(),
    observedAt: text("observed_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (t) => [
    unique("analytics_network_observations_event_epoch").on(t.eventId, t.epoch),
    index("analytics_network_observations_lookup").on(
      t.projectId,
      t.environment,
      t.epoch,
      t.networkKey,
      t.observedAt,
    ),
  ],
);

export const analyticsEntries = sqliteTable(
  "analytics_entries",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    contextId: text("context_id").notNull(),
    entryEventId: text("entry_event_id").notNull(),
    clickEventId: text("click_event_id"),
    method: text("method").notNull(),
    reason: text("reason").notNull(),
    candidateGroupCount: integer("candidate_group_count").notNull().default(0),
    elapsedMs: integer("elapsed_ms"),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (t) => [unique("analytics_entries_context").on(t.projectId, t.contextId)],
);

export const analyticsCustomers = sqliteTable(
  "analytics_customers",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environment: text("environment").notNull(),
    issuer: text("issuer").notNull(),
    externalId: text("external_id").notNull(),
    firstSeenAt: text("first_seen_at").notNull(),
    acquiredAt: text("acquired_at"),
    lifecycle: text("lifecycle").notNull().default("identity_known"),
    method: text("method").notNull().default("unattributed"),
    clickEventId: text("click_event_id"),
    contextId: text("context_id"),
    reason: text("reason").notNull().default("client_observation_missing"),
    decisionVersion: integer("decision_version").notNull().default(0),
    deliveryVersion: integer("delivery_version").notNull().default(0),
  },
  (t) => [
    unique("analytics_customers_customer").on(
      t.projectId,
      t.environment,
      t.issuer,
      t.externalId,
    ),
  ],
);

export const analyticsAttributions = sqliteTable(
  "analytics_attributions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    customerId: text("customer_id").notNull(),
    version: integer("version").notNull(),
    clickEventId: text("click_event_id"),
    method: text("method").notNull(),
    reason: text("reason").notNull(),
    candidateGroupCount: integer("candidate_group_count").notNull().default(0),
    elapsedMs: integer("elapsed_ms"),
    sourceHost: text("source_host"),
    pagePath: text("page_path"),
    referrerHost: text("referrer_host"),
    campaignSource: text("campaign_source"),
    campaignMedium: text("campaign_medium"),
    campaignName: text("campaign_name"),
    action: text("action"),
    destination: text("destination"),
    firstTouchAt: text("first_touch_at"),
    firstPagePath: text("first_page_path"),
    firstSource: text("first_source"),
    ruleVersion: integer("rule_version").notNull().default(1),
    createdAt: text("created_at").notNull(),
  },
  (t) => [unique("analytics_attributions_version").on(t.customerId, t.version)],
);

export const analyticsClaims = sqliteTable(
  "analytics_claims",
  {
    clickEventId: text("click_event_id").primaryKey(),
    customerId: text("customer_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
  },
  () => [],
);

export const analyticsOutcomes = sqliteTable(
  "analytics_outcomes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environment: text("environment").notNull(),
    issuer: text("issuer").notNull(),
    externalId: text("external_id").notNull(),
    customerId: text("customer_id").notNull(),
    contextId: text("context_id"),
    name: text("name").notNull(),
    occurredAt: text("occurred_at").notNull(),
    amountMinor: integer("amount_minor"),
    refundedMinor: integer("refunded_minor").notNull().default(0),
    currency: text("currency"),
    paymentId: text("payment_id"),
    source: text("source"),
  },
  (t) => [
    check(
      "analytics_refund_within_payment",
      sql`${t.refundedMinor} >= 0 AND (${t.amountMinor} IS NULL OR ${t.refundedMinor} <= ${t.amountMinor})`,
    ),
    unique("analytics_outcomes_outcome").on(
      t.projectId,
      t.environment,
      t.issuer,
      t.externalId,
    ),
    index("analytics_outcomes_customer").on(
      t.projectId,
      t.customerId,
      t.occurredAt,
    ),
  ],
);

export const analyticsOutbox = sqliteTable(
  "analytics_outbox",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    customerId: text("customer_id").notNull(),
    version: integer("version").notNull(),
    decisionVersion: integer("decision_version").notNull().default(0),
    kind: text("kind").notNull().default("acquisition"),
    outcomeId: text("outcome_id"),
    createdAt: text("created_at").notNull(),
    deliveredAt: text("delivered_at"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("next_attempt_at").notNull(),
    lastError: text("last_error"),
  },
  (t) => [unique("analytics_outbox_delivery").on(t.customerId, t.version)],
);

export const analyticsTombstones = sqliteTable(
  "analytics_tombstones",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull(),
    contextKey: text("context_key").notNull(),
    erasedAt: text("erased_at").notNull(),
  },
  (t) => [
    unique("analytics_tombstones_context").on(
      t.projectId,
      t.sourceId,
      t.contextKey,
    ),
  ],
);

// No individual, page, campaign or external identity values belong in these rollups.
export const analyticsDailyAggregates = sqliteTable(
  "analytics_daily_aggregates",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environment: text("environment").notNull(),
    day: text("day").notNull(),
    metric: text("metric").notNull(),
    currency: text("currency").notNull().default(""),
    value: integer("value").notNull(),
  },
  (t) => [
    unique("analytics_daily_aggregate_dimension").on(
      t.projectId,
      t.environment,
      t.day,
      t.metric,
      t.currency,
    ),
  ],
);

// Protected replay suppression ledger; retained across restores, never shown in exports.
export const analyticsErasureKeys = sqliteTable(
  "analytics_erasure_keys",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    identityKey: text("identity_key").notNull(),
    erasedAt: text("erased_at").notNull(),
  },
  (t) => [unique("analytics_erasure_identity").on(t.projectId, t.identityKey)],
);
