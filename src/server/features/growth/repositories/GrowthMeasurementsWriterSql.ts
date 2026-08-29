import { sql, type SQL } from "drizzle-orm";
import { getDatabaseProvider } from "@/db/provider";
import {
  growthChangeEvents,
  growthMeasurementMetrics,
  growthMeasurementObservations,
  growthMeasurementPlans,
  growthMeasurementResultChanges,
} from "@/db/schema";
import type {
  FinalizeMeasurementGraphInput,
  StartMeasurementGraphInput,
} from "./GrowthMeasurementsWriterTypes";

type LockableSource<T> = T & {
  for: (strength: "share" | "update") => T;
};

export function lockForPostgres<T>(source: T, strength: "share" | "update") {
  if (getDatabaseProvider() !== "postgres") return source;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the provider guard proves the Postgres-only locking surface
  return (source as unknown as LockableSource<T>).for(strength);
}

export function exactMetricSetSql(input: StartMeasurementGraphInput): SQL {
  const metrics = JSON.stringify(
    input.metrics.map(({ metricType, entityType, entityKey, isPrimary }) => ({
      metricType,
      entityType,
      entityKey,
      isPrimary,
    })),
  );
  const currentCount = sql`(
    SELECT count(*) FROM ${growthMeasurementMetrics} metric_count
    WHERE metric_count.project_id = ${input.projectId}
      AND metric_count.measurement_plan_id = ${growthMeasurementPlans.id}
  ) = ${input.metrics.length}`;
  if (getDatabaseProvider() === "postgres") {
    return sql`${currentCount} AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${metrics}::jsonb) AS expected(value)
      WHERE NOT EXISTS (
        SELECT 1 FROM ${growthMeasurementMetrics} metric_expected
        WHERE metric_expected.project_id = ${input.projectId}
          AND metric_expected.measurement_plan_id = ${growthMeasurementPlans.id}
          AND metric_expected.metric_type = expected.value->>'metricType'
          AND metric_expected.entity_type = expected.value->>'entityType'
          AND metric_expected.entity_key = expected.value->>'entityKey'
          AND metric_expected.is_primary = (expected.value->>'isPrimary')::boolean
      )
    ) AND NOT EXISTS (
      SELECT 1 FROM ${growthMeasurementMetrics} metric_current
      WHERE metric_current.project_id = ${input.projectId}
        AND metric_current.measurement_plan_id = ${growthMeasurementPlans.id}
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(${metrics}::jsonb) AS expected(value)
          WHERE metric_current.metric_type = expected.value->>'metricType'
            AND metric_current.entity_type = expected.value->>'entityType'
            AND metric_current.entity_key = expected.value->>'entityKey'
            AND metric_current.is_primary = (expected.value->>'isPrimary')::boolean
        )
    )`;
  }
  return sql`${currentCount} AND NOT EXISTS (
    SELECT 1 FROM json_each(${metrics}) AS expected
    WHERE NOT EXISTS (
      SELECT 1 FROM ${growthMeasurementMetrics} metric_expected
      WHERE metric_expected.project_id = ${input.projectId}
        AND metric_expected.measurement_plan_id = ${growthMeasurementPlans.id}
        AND metric_expected.metric_type = json_extract(expected.value, '$.metricType')
        AND metric_expected.entity_type = json_extract(expected.value, '$.entityType')
        AND metric_expected.entity_key = json_extract(expected.value, '$.entityKey')
        AND metric_expected.is_primary = json_extract(expected.value, '$.isPrimary')
    )
  ) AND NOT EXISTS (
    SELECT 1 FROM ${growthMeasurementMetrics} metric_current
    WHERE metric_current.project_id = ${input.projectId}
      AND metric_current.measurement_plan_id = ${growthMeasurementPlans.id}
      AND NOT EXISTS (
        SELECT 1 FROM json_each(${metrics}) AS expected
        WHERE metric_current.metric_type = json_extract(expected.value, '$.metricType')
          AND metric_current.entity_type = json_extract(expected.value, '$.entityType')
          AND metric_current.entity_key = json_extract(expected.value, '$.entityKey')
          AND metric_current.is_primary = json_extract(expected.value, '$.isPrimary')
      )
  )`;
}

export function exactObservationSetSql(
  input: FinalizeMeasurementGraphInput,
): SQL {
  const observations = JSON.stringify(input.observations);
  const currentCount = sql`(
    SELECT count(*) FROM ${growthMeasurementObservations} observation_count
    WHERE observation_count.project_id = ${input.projectId}
      AND observation_count.measurement_plan_id = ${growthMeasurementPlans.id}
  ) = ${input.observations.length}`;
  if (getDatabaseProvider() === "postgres") {
    return sql`${currentCount} AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${observations}::jsonb) AS expected(value)
      WHERE NOT EXISTS (
        SELECT 1 FROM ${growthMeasurementObservations} observation_expected
        WHERE observation_expected.project_id = ${input.projectId}
          AND observation_expected.measurement_plan_id = ${growthMeasurementPlans.id}
          AND observation_expected.id = expected.value->>'id'
          AND observation_expected.fact_hash = expected.value->>'factHash'
      )
    ) AND NOT EXISTS (
      SELECT 1 FROM ${growthMeasurementObservations} observation_current
      WHERE observation_current.project_id = ${input.projectId}
        AND observation_current.measurement_plan_id = ${growthMeasurementPlans.id}
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(${observations}::jsonb) AS expected(value)
          WHERE observation_current.id = expected.value->>'id'
            AND observation_current.fact_hash = expected.value->>'factHash'
        )
    )`;
  }
  return sql`${currentCount} AND NOT EXISTS (
    SELECT 1 FROM json_each(${observations}) AS expected
    WHERE NOT EXISTS (
      SELECT 1 FROM ${growthMeasurementObservations} observation_expected
      WHERE observation_expected.project_id = ${input.projectId}
        AND observation_expected.measurement_plan_id = ${growthMeasurementPlans.id}
        AND observation_expected.id = json_extract(expected.value, '$.id')
        AND observation_expected.fact_hash = json_extract(expected.value, '$.factHash')
    )
  ) AND NOT EXISTS (
    SELECT 1 FROM ${growthMeasurementObservations} observation_current
    WHERE observation_current.project_id = ${input.projectId}
      AND observation_current.measurement_plan_id = ${growthMeasurementPlans.id}
      AND NOT EXISTS (
        SELECT 1 FROM json_each(${observations}) AS expected
        WHERE observation_current.id = json_extract(expected.value, '$.id')
          AND observation_current.fact_hash = json_extract(expected.value, '$.factHash')
      )
  )`;
}

export function allConfoundersExistSql(
  input: FinalizeMeasurementGraphInput,
): SQL {
  const ids = JSON.stringify(input.confoundingChangeEventIds);
  if (getDatabaseProvider() === "postgres") {
    return sql`(
      SELECT count(*) = count(DISTINCT expected.id)
      FROM jsonb_array_elements_text(${ids}::jsonb) AS expected(id)
    ) AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(${ids}::jsonb) AS expected(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM ${growthChangeEvents} change_expected
        WHERE change_expected.project_id = ${input.projectId}
          AND change_expected.id = expected.id
      )
    )`;
  }
  return sql`(
    SELECT count(*) = count(DISTINCT expected.value)
    FROM json_each(${ids}) AS expected
  ) AND NOT EXISTS (
    SELECT 1 FROM json_each(${ids}) AS expected
    WHERE NOT EXISTS (
      SELECT 1 FROM ${growthChangeEvents} change_expected
      WHERE change_expected.project_id = ${input.projectId}
        AND change_expected.id = expected.value
    )
  )`;
}

export function exactConfounderSetSql(
  input: FinalizeMeasurementGraphInput,
): SQL {
  const ids = JSON.stringify(input.confoundingChangeEventIds);
  const currentCount = sql`(
    SELECT count(*) FROM ${growthMeasurementResultChanges} change_count
    WHERE change_count.project_id = ${input.projectId}
      AND change_count.measurement_result_id = ${input.id}
  ) = ${input.confoundingChangeEventIds.length}`;
  if (getDatabaseProvider() === "postgres") {
    return sql`${currentCount} AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(${ids}::jsonb) AS expected(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM ${growthMeasurementResultChanges} change_expected
        WHERE change_expected.project_id = ${input.projectId}
          AND change_expected.measurement_result_id = ${input.id}
          AND change_expected.change_event_id = expected.id
      )
    )`;
  }
  return sql`${currentCount} AND NOT EXISTS (
    SELECT 1 FROM json_each(${ids}) AS expected
    WHERE NOT EXISTS (
      SELECT 1 FROM ${growthMeasurementResultChanges} change_expected
      WHERE change_expected.project_id = ${input.projectId}
        AND change_expected.measurement_result_id = ${input.id}
        AND change_expected.change_event_id = expected.value
    )
  )`;
}
