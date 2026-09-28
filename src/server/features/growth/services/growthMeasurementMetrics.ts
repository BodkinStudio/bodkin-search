// The metrics a page-level change is judged on: Search Console clicks
// (primary) and impressions for each target URL.
export function proposalMetrics(urlTargets: string[]) {
  return urlTargets.flatMap((entityKey) => [
    {
      metricType: "search_clicks" as const,
      entityType: "url" as const,
      entityKey,
      isPrimary: true,
    },
    {
      metricType: "search_impressions" as const,
      entityType: "url" as const,
      entityKey,
      isPrimary: false,
    },
  ]);
}
