import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import type { ToolAuthContext } from "@/server/mcp/context";
import {
  growthRecordChangeRequestSchema,
  type GrowthRecordChangeRequest,
} from "@/types/schemas/growth-record-change";
import { GrowthChangeEventsService } from "./GrowthChangeEventsService";
import { projectManualChangeEvent } from "./GrowthManualChangeProjector";
type AuthPrincipal = Pick<ToolAuthContext, "userId" | "clientId">;
function principalIdentity(auth: AuthPrincipal) {
  return JSON.stringify([auth.userId, auth.clientId]);
}
async function principal(auth: AuthPrincipal, identity: string) {
  const readable = `mcp:${identity}`;
  return readable.length <= 200 ? readable : `mcp:${await sha256Hex(readable)}`;
}
async function recordChange(
  input: GrowthRecordChangeRequest,
  auth: AuthPrincipal,
) {
  const request = growthRecordChangeRequestSchema.parse(input);
  if (new Date(request.happenedAt).valueOf() > Date.now())
    throw new AppError(
      "VALIDATION_ERROR",
      "Change Event happenedAt cannot be in the future",
    );
  const identity = principalIdentity(auth);
  const actorId = await principal(auth, identity);
  const creationKey = `mcp-change:${await sha256Hex(
    JSON.stringify([identity, request.requestKey]),
  )}`;
  const graph = await GrowthChangeEventsService.recordManualEvent({
    projectId: request.projectId,
    creationKey,
    changeType: request.changeType,
    actorType: "agent",
    actorId,
    description: request.description,
    happenedAt: request.happenedAt,
    urls: request.urls,
  });
  return projectManualChangeEvent(graph.event, graph.urls);
}
export const GrowthRecordChangeService = { recordChange } as const;
