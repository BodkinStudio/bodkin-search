import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import {
  clientWorkspacesEnabled,
  requireWorkspaceMembership,
} from "@/server/features/workspaces/WorkspaceAccess";
import { AppError } from "@/server/lib/errors";
import type { ToolContext } from "@/server/mcp/context";
import type { WorkspaceCapability } from "@/shared/workspaces/permissions";

// The workspace capability each tool needs in client-workspace mode: "read"
// views saved data, "edit" changes project content, "run" spends DataForSEO or
// commits the workspace to future metered work. OAuth scopes still gate the
// growth write tools on top of this, so a token can only narrow a role.
// A tool missing here is refused in client mode (fail closed).
export const MCP_TOOL_CAPABILITIES: Record<string, WorkspaceCapability> = {
  whoami: "read",
  list_projects: "read",
  create_project: "configure",
  get_project_context: "read",
  update_project_context: "configure",
  list_saved_keywords: "read",
  save_keywords: "edit",
  research_keywords: "run",
  get_keyword_metrics: "run",
  get_domain_overview: "run",
  get_domain_keyword_suggestions: "run",
  get_backlinks_overview: "run",
  get_backlinks_profile: "run",
  get_serp_results: "run",
  get_ranked_keywords: "run",
  find_serp_competitors: "run",
  search_local_businesses: "run",
  get_local_serp_results: "run",
  get_google_business_questions: "run",
  get_business_profile: "run",
  get_business_reviews: "run",
  get_business_updates: "run",
  list_business_categories: "read",
  get_local_rank_grid: "run",
  create_rank_tracker: "run",
  add_rank_tracking_keywords: "run",
  run_rank_tracker: "run",
  remove_rank_tracking_keywords: "edit",
  get_rank_tracker: "read",
  estimate_rank_tracker_cost: "read",
  get_search_console_performance: "read",
  inspect_urls: "read",
  get_google_analytics_organic_landing_pages: "read",
  get_google_analytics_page_performance: "read",
  get_google_analytics_key_events: "read",
  get_search_opportunities: "read",
  get_google_analytics_organic_overview: "read",
  get_google_analytics_traffic_acquisition: "read",
  get_google_analytics_measurement_health: "read",
  get_google_analytics_ecommerce_performance: "read",
  get_google_analytics_site_search: "read",
  get_google_analytics_audience_breakdown: "read",
  get_youtube_channel_overview: "read",
  get_youtube_video_performance: "read",
  get_youtube_traffic_sources: "read",
  get_linkedin_page_overview: "read",
  get_linkedin_post_performance: "read",
  run_site_audit: "run",
  get_audit_status: "read",
  get_audit_issues: "read",
  get_audit_pages: "read",
  analytics_query: "read",
  growth_get_plan: "read",
  growth_get_project_summary: "read",
  growth_get_page_context: "read",
  growth_get_actions: "read",
  growth_get_action: "read",
  growth_get_priority_recommendations: "read",
  growth_get_recent_changes: "read",
  growth_get_measurements: "read",
  growth_get_monthly_summary: "read",
  growth_record_change: "edit",
  growth_create_workstream: "edit",
  growth_update_workstream: "edit",
  growth_create_action: "edit",
  growth_add_action_evidence: "edit",
  growth_update_plan_narrative: "edit",
};

function argsProjectId(args: unknown) {
  return typeof args === "object" &&
    args !== null &&
    "projectId" in args &&
    typeof args.projectId === "string"
    ? args.projectId
    : null;
}

// Client-workspace authorisation for one MCP/SAM tool call. The workspace is
// the one owning the project the call names (the token's workspace for
// project-less tools), and the caller must hold the tool's capability there.
// Returns the context re-scoped to that workspace so project checks and
// billing downstream use it. Outside client mode the context is unchanged.
export async function authorizeMcpToolCall(
  toolName: string,
  args: unknown,
  context: ToolContext,
): Promise<ToolContext> {
  if (!clientWorkspacesEnabled()) return context;
  const capability = MCP_TOOL_CAPABILITIES[toolName];
  if (!capability) throw new AppError("FORBIDDEN");
  const projectId = argsProjectId(args);
  const project = projectId
    ? await ProjectRepository.getProjectById(projectId)
    : null;
  if (projectId && !project) throw new AppError("FORBIDDEN");
  const organizationId = project?.organizationId ?? context.auth.organizationId;
  await requireWorkspaceMembership(
    context.auth.userId,
    organizationId,
    capability,
  );
  return { auth: { ...context.auth, organizationId } };
}
