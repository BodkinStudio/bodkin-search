import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { PageShell } from "@/client/components/PageShell";
import {
  SectionNav,
  sectionNavItemClass,
} from "@/client/components/SectionNav";

export const Route = createFileRoute("/_project/p/$projectId/growth")({
  component: GrowthLayout,
});

const tabs = [
  { to: "/p/$projectId/growth" as const, label: "Plan", exact: true },
  { to: "/p/$projectId/growth/operations" as const, label: "Operations" },
];

function GrowthLayout() {
  const { projectId } = Route.useParams();
  return (
    <PageShell
      title="Growth"
      description="What we are working on, why, and how we will know it worked."
      nav={
        <SectionNav label="Growth">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              params={{ projectId }}
              activeOptions={{ exact: tab.exact ?? false }}
              activeProps={{ className: sectionNavItemClass(true) }}
              inactiveProps={{ className: sectionNavItemClass(false) }}
            >
              {tab.label}
            </Link>
          ))}
        </SectionNav>
      }
    >
      <Outlet />
    </PageShell>
  );
}
