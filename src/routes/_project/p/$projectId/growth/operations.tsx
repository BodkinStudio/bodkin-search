import { createFileRoute, redirect } from "@tanstack/react-router";
import { growthSectionForHash } from "@/client/features/growth/growthSectionList";

// Operations was one page with anchors; its sections are now Growth tabs.
// Old links (including those the MCP tools hand out) land on the right tab
// with their anchor intact.
export const Route = createFileRoute(
  "/_project/p/$projectId/growth/operations",
)({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      to: "/p/$projectId/growth/$section",
      params: {
        projectId: params.projectId,
        section: growthSectionForHash(`#${location.hash}`),
      },
      hash: location.hash,
      replace: true,
    });
  },
});
