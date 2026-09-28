import type { GrowthChangeEventType } from "@/types/schemas/growth-change-events";

export const GROWTH_CHANGE_LABELS: Record<GrowthChangeEventType, string> = {
  content_updated: "Content updated",
  title_meta_updated: "Title or meta description updated",
  page_created: "Page created",
  page_removed: "Page removed",
  redirect_changed: "Redirect changed",
  internal_links_changed: "Internal links changed",
  template_changed: "Template changed",
  structured_data_changed: "Structured data changed",
  technical_fix: "Technical fix",
  design_restructure: "Design restructured",
  migration: "Migration",
  unknown: "Not sure",
  mixed: "Several types of change",
};
