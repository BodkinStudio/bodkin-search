import type { ReactNode } from "react";

// Sub-page navigation drawn as underline tabs. These are links between views,
// not an ARIA tablist, so the current one is marked with aria-current (which
// TanStack Router's Link sets on its own) and the strip scrolls sideways
// instead of clipping on narrow screens.
export function SectionNav({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <nav
      aria-label={label}
      className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0"
    >
      <div className="flex min-w-max gap-1 border-b border-base-300">
        {children}
      </div>
    </nav>
  );
}

// Shared look for a SectionNav item; pass to a Link's className or a button.
export function sectionNavItemClass(active: boolean) {
  return [
    "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
    active
      ? "border-primary font-medium text-base-content"
      : "border-transparent text-base-content/60 hover:text-base-content",
  ].join(" ");
}
