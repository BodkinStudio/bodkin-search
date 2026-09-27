import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { PageShell } from "@/client/components/PageShell";
import { GROWTH_SECTIONS } from "@/client/features/growth/growthSectionList";
import {
  SectionNav,
  sectionNavItemClass,
} from "@/client/components/SectionNav";

export const Route = createFileRoute("/_project/p/$projectId/growth")({
  component: GrowthLayout,
});

function GrowthLayout() {
  const { projectId } = Route.useParams();
  return (
    <PageShell
      title="Growth"
      description="What we are working on, why, and how we will know it worked."
      nav={
        <SectionNav label="Growth">
          <Link
            to="/p/$projectId/growth"
            params={{ projectId }}
            activeOptions={{ exact: true }}
            activeProps={{ className: sectionNavItemClass(true) }}
            inactiveProps={{ className: sectionNavItemClass(false) }}
          >
            Plan
          </Link>
          {GROWTH_SECTIONS.map((section) => (
            <Link
              key={section.value}
              to="/p/$projectId/growth/$section"
              params={{ projectId, section: section.value }}
              activeProps={{ className: sectionNavItemClass(true) }}
              inactiveProps={{ className: sectionNavItemClass(false) }}
            >
              {section.label}
            </Link>
          ))}
        </SectionNav>
      }
    >
      <Outlet />
    </PageShell>
  );
}
