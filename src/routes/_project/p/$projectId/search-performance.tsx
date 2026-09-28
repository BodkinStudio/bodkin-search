import { createFileRoute, redirect } from "@tanstack/react-router";

// Search Console now lives in Analytics; old links and bookmarks land there.
export const Route = createFileRoute(
  "/_project/p/$projectId/search-performance",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/p/$projectId/analytics",
      params,
      search: { view: "search" },
      replace: true,
    });
  },
});
