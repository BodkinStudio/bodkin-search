// Tables that keep their own copy of a project's organization_id next to its
// project_id. Moving a project between workspaces must re-point every one of
// them with the project row; WorkspaceProjectMove.test.ts fails if a schema
// gains another such table without it being listed here.
export const PROJECT_ORGANIZATION_TABLES = [
  "gsc_connections",
  "ga4_connections",
  "google_ads_connections",
  "youtube_connections",
  "linkedin_page_connections",
] as const;
