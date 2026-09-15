import { z } from "zod";
import { GROWTH_CHANGE_CREATE_SCOPE } from "@/lib/oauth-resource";
import { GrowthRecordChangeService } from "@/server/features/growth/services/GrowthRecordChangeService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { withMcpOperationScope } from "@/server/mcp/operation-auth";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  growthRecordChangeRequestSchema,
  growthRecordedChangeDtoSchema,
  type GrowthRecordChangeRequest,
} from "@/types/schemas/growth-record-change";

export const growthRecordChangeTool = {
  name: "growth_record_change",
  config: {
    title: "Record or Replay Manual Growth Change",
    description:
      "Records one immutable manual Change Event for authorized project URLs. Reusing requestKey with the exact same fact safely replays the existing event; changing that fact conflicts. This writes saved OpenSEO state but uses zero credits and no providers. happenedAt is caller supplied, not independently verified. It does not link an Action, change Action status, or start Measurement.",
    inputSchema: growthRecordChangeRequestSchema,
    outputSchema: z.strictObject({
      change: growthRecordedChangeDtoSchema,
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOperationScope(
    GROWTH_CHANGE_CREATE_SCOPE,
    withMcpProjectAuth(async (args: GrowthRecordChangeRequest, context) => {
      const change = await GrowthRecordChangeService.recordChange(
        args,
        context.auth,
      );
      return mcpResponse({
        text: `Recorded or replayed saved manual Change Event [${change.id}] with caller-supplied happenedAt ${change.happenedAt}. Reuse requestKey only to retry this exact immutable fact. It does not link an Action, change Action status, or start Measurement.`,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/growth/operations#growth-change-log`,
        ),
        structuredContent: { change },
      });
    }),
  ),
};
