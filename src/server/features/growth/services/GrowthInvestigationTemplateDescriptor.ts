import type { RecordGrowthSignalInput } from "@/types/schemas/growth";

export type GrowthInvestigationTemplateDescriptor = {
  family:
    | "priority_page"
    | "striking_distance"
    | "low_ctr"
    | "persistent_rank_drop";
  templateVersion: string;
  run: {
    cadenceSlotPrefix: string;
    detectorVersions: readonly string[];
  };
  controller: {
    signalType: string;
    entityType: string;
    metric: string;
    evidenceKind: RecordGrowthSignalInput["evidenceKind"];
  };
  companionMetrics: readonly string[];
  actionKeyPrefix: string;
  releasesControllers: boolean;
};

export const priorityPageInvestigationDescriptor = {
  family: "priority_page",
  templateVersion: "priority-page-investigation-v1",
  run: {
    cadenceSlotPrefix: "priority-page-check:",
    detectorVersions: [
      "priority-page-click-decline-v1",
      "priority-page-click-decline-v2",
    ],
  },
  controller: {
    signalType: "priority_page_click_decline",
    entityType: "key_page",
    metric: "gsc_clicks",
    evidenceKind: "gsc_period",
  },
  companionMetrics: [],
  actionKeyPrefix: "priority-page-investigation-v1:action:",
  releasesControllers: true,
} as const satisfies GrowthInvestigationTemplateDescriptor;

export const strikingDistanceInvestigationDescriptor = {
  family: "striking_distance",
  templateVersion: "striking-distance-investigation-v1",
  run: {
    cadenceSlotPrefix: "striking-distance-check:",
    detectorVersions: ["striking-distance-query-v1"],
  },
  controller: {
    signalType: "striking_distance_query",
    entityType: "search_query",
    metric: "gsc_impressions",
    evidenceKind: "gsc_period",
  },
  companionMetrics: ["gsc_clicks", "gsc_average_position"],
  actionKeyPrefix: "striking-distance-investigation-v1:action:",
  releasesControllers: false,
} as const satisfies GrowthInvestigationTemplateDescriptor;

export const lowCtrInvestigationDescriptor = {
  family: "low_ctr",
  templateVersion: "high-impression-low-ctr-investigation-v1",
  run: {
    cadenceSlotPrefix: "low-ctr-check:",
    detectorVersions: ["high-impression-low-ctr-v1"],
  },
  controller: {
    signalType: "ctr_below_expected",
    entityType: "search_query",
    metric: "gsc_ctr",
    evidenceKind: "gsc_period",
  },
  companionMetrics: ["gsc_clicks", "gsc_impressions", "gsc_average_position"],
  actionKeyPrefix: "high-impression-low-ctr-investigation-v1:action:",
  releasesControllers: false,
} as const satisfies GrowthInvestigationTemplateDescriptor;

export const persistentRankDropInvestigationDescriptor = {
  family: "persistent_rank_drop",
  templateVersion: "persistent-tracked-rank-drop-investigation-v1",
  run: {
    cadenceSlotPrefix: "persistent-rank-drop-check:",
    detectorVersions: ["persistent-tracked-rank-drop-v1"],
  },
  controller: {
    signalType: "tracked_rank_drop",
    entityType: "tracked_keyword",
    metric: "organic_rank_position_floor",
    evidenceKind: "rank_snapshot",
  },
  companionMetrics: [],
  actionKeyPrefix: "persistent-tracked-rank-drop-investigation-v1:action:",
  releasesControllers: false,
} as const satisfies GrowthInvestigationTemplateDescriptor;

const growthInvestigationDescriptors = [
  priorityPageInvestigationDescriptor,
  strikingDistanceInvestigationDescriptor,
  lowCtrInvestigationDescriptor,
  persistentRankDropInvestigationDescriptor,
] as const;

export function investigationKeysForDescriptor(
  descriptor: GrowthInvestigationTemplateDescriptor,
  signalId: string,
) {
  return {
    insight: `${descriptor.templateVersion}:insight:${signalId}`,
    recommendation: `${descriptor.templateVersion}:recommendation:${signalId}`,
    action: `${descriptor.actionKeyPrefix}${signalId}`,
  };
}

export function descriptorForRunAndController(input: {
  run: {
    runType: string;
    cadenceSlot: string;
    detectorVersion: string;
    analysisVersion: string | null;
    status: string;
  };
  signal: {
    signalType: string;
    entityType: string;
    metric: string;
    evidenceKind: string;
  };
}) {
  return growthInvestigationDescriptors.find(
    (descriptor) =>
      input.run.runType === "manual_analysis" &&
      input.run.cadenceSlot.startsWith(descriptor.run.cadenceSlotPrefix) &&
      descriptor.run.detectorVersions.some(
        (version) => version === input.run.detectorVersion,
      ) &&
      input.run.analysisVersion === descriptor.templateVersion &&
      ["completed", "completed_with_errors"].includes(input.run.status) &&
      input.signal.signalType === descriptor.controller.signalType &&
      input.signal.entityType === descriptor.controller.entityType &&
      input.signal.metric === descriptor.controller.metric &&
      input.signal.evidenceKind === descriptor.controller.evidenceKind,
  );
}
