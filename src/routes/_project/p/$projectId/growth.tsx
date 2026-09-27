import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { PageShell } from "@/client/components/PageShell";
import {
  GROWTH_SECTIONS,
  growthSectionForHash,
} from "@/client/features/growth/growthSectionList";
import {
  SectionNav,
  sectionNavItemClass,
} from "@/client/components/SectionNav";

export const Route = createFileRoute("/_project/p/$projectId/growth")({
  component: GrowthLayout,
});

function GrowthLayout() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  // Growth components link to each other's sections by anchor. When the
  // anchor is on another tab, go to that tab instead of doing nothing.
  const followAnchorAcrossTabs = (event: MouseEvent) => {
    if (
      !(event.target instanceof Element) ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const hash = event.target
      .closest('a[href^="#growth-"]')
      ?.getAttribute("href");
    if (!hash || document.getElementById(hash.slice(1))) return;
    event.preventDefault();
    void navigate({
      to: "/p/$projectId/growth/$section",
      params: { projectId, section: growthSectionForHash(hash) },
      hash: hash.slice(1),
    });
  };
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
      {/* Delegates clicks from the links inside; a keyboard-activated link fires click too. */}
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div onClickCapture={followAnchorAcrossTabs}>
        <Outlet />
      </div>
    </PageShell>
  );
}
