import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

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
    <div>
      <div className="mx-auto max-w-7xl px-4 pt-4 md:px-6 md:pt-6">
        <div role="tablist" className="tabs tabs-border">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              role="tab"
              to={tab.to}
              params={{ projectId }}
              activeOptions={{ exact: tab.exact ?? false }}
              className="tab"
              activeProps={{ className: "tab-active", "aria-selected": true }}
              inactiveProps={{ "aria-selected": false }}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
      <Outlet />
    </div>
  );
}
