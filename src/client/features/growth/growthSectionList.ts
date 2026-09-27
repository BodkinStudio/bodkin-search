// The Growth tabs after the plan, in the order work moves through them.
export const GROWTH_SECTION_VALUES = [
  "priorities",
  "work",
  "reports",
  "data",
] as const;
export type GrowthSectionName = (typeof GROWTH_SECTION_VALUES)[number];

export const GROWTH_SECTIONS: readonly {
  value: GrowthSectionName;
  label: string;
  description: string;
}[] = [
  {
    value: "priorities",
    label: "Priorities",
    description: "What is worth doing next, and the opportunities behind it.",
  },
  {
    value: "work",
    label: "Work",
    description:
      "Everything in flight: plan actions, work approved from saved checks, and the changes made to the site.",
  },
  {
    value: "reports",
    label: "Reports",
    description: "The monthly review and the report you share with the team.",
  },
  {
    value: "data",
    label: "Data & checks",
    description: "Whether the data is ready, and the checks that watch it.",
  },
];

// Links that still use the old single Operations page's anchors.
export function growthSectionForHash(hash: string): GrowthSectionName {
  if (/growth-(work|change-log)/.test(hash)) return "work";
  if (/growth-monthly/.test(hash)) return "reports";
  if (
    /growth-(live-readiness|live-check|run-inspector|priority-page)/.test(hash)
  )
    return "data";
  return "priorities";
}
