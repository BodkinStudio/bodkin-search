import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/serverFunctions/projectContext", () => ({
  updateProjectContext: vi.fn(),
}));

import {
  KeyPageGrowthBadges,
  KeyPageGrowthFields,
  parseCommercialWeight,
} from "./KeyPagesSection";

describe("key-page Growth metadata", () => {
  it("parses only the nullable 1–5 commercial scale", () => {
    expect(parseCommercialWeight("")).toBeNull();
    expect(parseCommercialWeight("1")).toBe(1);
    expect(parseCommercialWeight("5")).toBe(5);
    expect(parseCommercialWeight("0")).toBeNull();
    expect(parseCommercialWeight("6")).toBeNull();
    expect(parseCommercialWeight("not-a-number")).toBeNull();
  });

  it("renders labelled native controls with the saved values", () => {
    const html = renderToStaticMarkup(
      createElement(KeyPageGrowthFields, {
        draft: {
          url: "https://bodkin.studio/services",
          role: "money",
          topic: "SEO agency",
          notes: "Core service page",
          commercialWeight: 5,
          protected: true,
          activelyOptimized: true,
        },
        onChange: vi.fn(),
      }),
    );

    expect(html).toContain("Growth signals");
    expect(html).toContain("Commercial priority");
    expect(html).toContain("Protected page");
    expect(html).toContain("Active optimisation");
    expect(html).toContain('value="5" selected=""');
    expect(html.match(/checked=""/g)).toHaveLength(2);
  });

  it("discloses saved metadata without inventing an unset priority", () => {
    let html = renderToStaticMarkup(
      createElement(KeyPageGrowthBadges, {
        commercialWeight: 4,
        protectedPage: true,
        activelyOptimized: false,
      }),
    );
    expect(html).toContain("Commercial priority 4/5");
    expect(html).toContain("Protected");

    html = renderToStaticMarkup(
      createElement(KeyPageGrowthBadges, {
        commercialWeight: null,
        protectedPage: false,
        activelyOptimized: false,
      }),
    );
    expect(html).toBe("");
  });
});
