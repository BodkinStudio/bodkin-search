import { createFileRoute } from "@tanstack/react-router";
import { handleCollect } from "@/server/features/analytics/AnalyticsHttp";
export const Route = createFileRoute("/api/analytics/collect")({
  server: {
    handlers: {
      POST: ({ request }) => handleCollect(request),
      OPTIONS: ({ request }) => handleCollect(request),
    },
  },
});
