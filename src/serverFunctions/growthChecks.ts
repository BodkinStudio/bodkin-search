import { createServerFn } from "@tanstack/react-start";
import { GrowthPriorityPageCheckService } from "@/server/features/growth/services/GrowthPriorityPageCheckService";
import { GrowthStrikingDistanceCheckService } from "@/server/features/growth/services/GrowthStrikingDistanceCheckService";
import { GrowthLowCtrCheckService } from "@/server/features/growth/services/GrowthLowCtrCheckService";
import { GrowthPersistentRankDropCheckService } from "@/server/features/growth/services/GrowthPersistentRankDropCheckService";
import { GrowthCriticalAuditIssueCheckService } from "@/server/features/growth/services/GrowthCriticalAuditIssueCheckService";
import { GrowthMeasurementDueCheckService } from "@/server/features/growth/services/GrowthMeasurementDueCheckService";
import { requireProjectContext } from "./middleware";
import {
  getGrowthCheckEvidenceSchema,
  getGrowthCheckRunSchema,
  getGrowthChecksOverviewSchema,
  runGrowthCheckSchema,
} from "@/types/schemas/growth-checks";

export const getGrowthChecksOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getGrowthChecksOverviewSchema)
  .handler(async ({ context }) =>
    GrowthPriorityPageCheckService.getOverview(context.projectId),
  );
export const runGrowthCheck = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(runGrowthCheckSchema)
  .handler(async ({ data, context }) =>
    GrowthPriorityPageCheckService.runCheck({
      projectId: context.projectId,
      requestKey: data.requestKey,
    }),
  );
export const runGrowthStrikingDistanceCheck = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(runGrowthCheckSchema)
  .handler(async ({ data, context }) =>
    GrowthStrikingDistanceCheckService.runCheck({
      projectId: context.projectId,
      requestKey: data.requestKey,
    }),
  );
export const runGrowthLowCtrCheck = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(runGrowthCheckSchema)
  .handler(async ({ data, context }) =>
    GrowthLowCtrCheckService.runCheck({
      projectId: context.projectId,
      requestKey: data.requestKey,
    }),
  );
export const runGrowthPersistentRankDropCheck = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(runGrowthCheckSchema)
  .handler(async ({ data, context }) =>
    GrowthPersistentRankDropCheckService.runCheck({
      projectId: context.projectId,
      requestKey: data.requestKey,
    }),
  );
export const runGrowthCriticalAuditIssueCheck = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(runGrowthCheckSchema)
  .handler(async ({ data, context }) =>
    GrowthCriticalAuditIssueCheckService.runCheck({
      projectId: context.projectId,
      requestKey: data.requestKey,
    }),
  );
export const runGrowthMeasurementDueCheck = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(runGrowthCheckSchema)
  .handler(async ({ data, context }) =>
    GrowthMeasurementDueCheckService.runCheck({
      projectId: context.projectId,
      requestKey: data.requestKey,
    }),
  );
export const getGrowthCheckRun = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getGrowthCheckRunSchema)
  .handler(async ({ data, context }) =>
    GrowthPriorityPageCheckService.getRunDetail(context.projectId, data.runId),
  );
export const getGrowthCheckEvidence = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getGrowthCheckEvidenceSchema)
  .handler(async ({ data, context }) =>
    GrowthPriorityPageCheckService.getEvidence({
      projectId: context.projectId,
      organizationId: context.organizationId,
      signalId: data.signalId,
    }),
  );
