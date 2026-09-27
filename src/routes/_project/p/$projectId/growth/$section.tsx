import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { GrowthSection } from "@/client/features/growth/GrowthSections";
import { GROWTH_SECTION_VALUES } from "@/client/features/growth/growthSectionList";

const sectionSchema = z.enum(GROWTH_SECTION_VALUES);

export const Route = createFileRoute("/_project/p/$projectId/growth/$section")({
  validateSearch: z.object({ run: z.string().optional().catch(undefined) }),
  beforeLoad: ({ params }) => {
    if (!sectionSchema.safeParse(params.section).success)
      throw redirect({
        to: "/p/$projectId/growth",
        params: { projectId: params.projectId },
        replace: true,
      });
  },
  component: GrowthSectionRoute,
});

export function GrowthSectionRoute() {
  const { projectId, section } = Route.useParams();
  const { run } = Route.useSearch();
  const navigate = Route.useNavigate();
  const openRun = (runId: string | null) =>
    void navigate({
      to: "/p/$projectId/growth/$section",
      params: { projectId, section: "data" },
      search: { run: runId ?? undefined },
    });
  // Keyed by project so switching projects remounts every nested query,
  // filter and selection instead of carrying one project's state over.
  return (
    <GrowthSection
      key={projectId}
      projectId={projectId}
      section={sectionSchema.parse(section)}
      runId={run ?? null}
      onOpenCheck={openRun}
      onSelectRun={openRun}
    />
  );
}
