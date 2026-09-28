import { createFileRoute } from "@tanstack/react-router";
import { diagnoseNetwork } from "@/server/features/analytics/AnalyticsDiagnostics";
import { analyticsCors } from "@/server/features/analytics/AnalyticsHttp";
async function handle(request: Request) {
  const cors = await analyticsCors(request);
  if (request.headers.has("origin") && !cors)
    return new Response(null, { status: 403 });
  const response =
    request.method === "OPTIONS"
      ? new Response(null, { status: 204 })
      : await diagnoseNetwork(request);
  if (cors)
    for (const [key, value] of Object.entries(cors))
      response.headers.set(key, value);
  response.headers.set("Access-Control-Allow-Headers", "Authorization");
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return response;
}
export const Route = createFileRoute("/api/analytics/diagnostics/ip")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      OPTIONS: ({ request }) => handle(request),
    },
  },
});
