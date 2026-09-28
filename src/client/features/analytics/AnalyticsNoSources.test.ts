import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsNoSources } from "./AnalyticsNoSources";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) =>
    createElement("a", {}, children),
}));
describe("analytics setup access", () => {
  it("gives non-admins a useful empty state without a setup action", () => {
    const html = renderToStaticMarkup(
      createElement(AnalyticsNoSources, {
        projectId: "sample",
        canAdminister: false,
      }),
    );
    expect(html).toContain("Ask a workspace administrator");
    expect(html).not.toContain("<a");
  });
  it("retains tracking setup for authorized administrators", () => {
    const html = renderToStaticMarkup(
      createElement(AnalyticsNoSources, {
        projectId: "sample",
        canAdminister: true,
      }),
    );
    expect(html).toContain("Set up tracking");
    expect(html).toContain("<a");
  });
});

import { AnalyticsNoActivity } from "./AnalyticsInspectionState";
it.each([false, true])(
  "no activity setup link requires admin: %s",
  (canAdminister) => {
    const html = renderToStaticMarkup(
      createElement(AnalyticsNoActivity, {
        projectId: "sample",
        canAdminister,
      }),
    );
    expect(html.includes("<a")).toBe(canAdminister);
    expect(html).toContain("Check the environment and date range");
  },
);
