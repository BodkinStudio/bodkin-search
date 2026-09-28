export type GrowthSearchPerformanceCollectionInput = {
  projectId: string;
  startDate: string;
  endDate: string;
  capturedAt: string;
  includeSiteContext?: boolean;
  maxPageRequests?: number;
};

export type FrozenGrowthSearchPerformanceSnapshot = {
  projectId: string;
  property: string;
  capturedAt: string;
  sourceWindow: { startDate: string; endDate: string };
  retrievalStatus: "exhausted" | "capped";
  /** Exact provider page/date requests consumed by this collection call. */
  requestsUsed: number;
  observations: Array<{
    rawUrl: string;
    date: string;
    clicks: number;
    impressions: number;
  }>;
};

export type FrozenTargetCollectionInput = Omit<
  GrowthSearchPerformanceCollectionInput,
  "includeSiteContext"
> & {
  targetUrls: string[];
};
