import { createFileRoute } from "@tanstack/react-router";
import { handleServerEvent } from "@/server/features/analytics/AnalyticsHttp";
export const Route = createFileRoute("/api/analytics/events/server")({
  server: { handlers: { POST: ({ request }) => handleServerEvent(request) } },
});
