import type { ReactNode } from "react";

// The frame every top-level page shares: one scroll container, one content
// width, one gutter, and a title block with room for page actions and a
// section nav underneath.
export function PageShell({
  title,
  description,
  actions,
  nav,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  nav?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold">{title}</h1>
              {description ? (
                <p className="mt-1 max-w-2xl text-sm text-base-content/70">
                  {description}
                </p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </div>
          {nav}
        </header>
        {children}
      </div>
    </div>
  );
}
