import { LinkedInApiError } from "@/server/lib/linkedinErrors";
import { LinkedInPageContentService } from "./LinkedInPageContentService";
import { LinkedInPageApiService } from "./LinkedInPageApiService";

function apiReason(error: unknown) {
  if (error instanceof LinkedInApiError) {
    const code =
      error.failure === "unauthorized"
        ? "reconnect_required"
        : error.failure === "forbidden"
          ? "page_inaccessible"
          : error.failure;
    return {
      code,
      message: `LinkedIn API ${code.replaceAll("_", " ")}.`,
      ...(error.retryAfterSeconds === null
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
    } as const;
  }
  return { code: "upstream" as const, message: "LinkedIn API is unavailable." };
}
/** One source-selection boundary for dashboard and MCP. Sources are never merged. */
export const LinkedInPageReportingService = {
  async overview(input: {
    projectId: string;
    startDate?: string;
    endDate?: string;
  }) {
    try {
      return await LinkedInPageApiService.overview(input);
    } catch (apiError) {
      const reason = apiReason(apiError);
      const manual = await LinkedInPageContentService.overview({
        projectId: input.projectId,
      });
      if (manual.status === "ok") return { ...manual, apiFallback: reason };
      return {
        status: "error" as const,
        projectId: input.projectId,
        error: {
          ...reason,
          actionUrl: `/p/${input.projectId}/settings/integrations#linkedin`,
        },
      };
    }
  },
};
