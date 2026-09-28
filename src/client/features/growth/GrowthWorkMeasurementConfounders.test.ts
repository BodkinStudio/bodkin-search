import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GrowthWorkMeasurementConfounders as Confounders } from "@/types/schemas/growth-work";
import { GrowthWorkMeasurementConfounders } from "./GrowthWorkMeasurementConfounders";

const base: Confounders = {
  state: "none",
  intervalStart: "2026-07-04",
  intervalEnd: "2026-10-30",
  candidates: [],
  limit: 50,
};

function render(confounders: Confounders) {
  return renderToStaticMarkup(
    createElement(GrowthWorkMeasurementConfounders, { confounders }),
  );
}

describe("GrowthWorkMeasurementConfounders", () => {
  it("renders deterministic candidate evidence with non-causal limitations", () => {
    const html = render({
      ...base,
      state: "complete",
      candidates: [
        {
          id: "change_2",
          changeType: "template_changed",
          description: "<script>Changed shared cards</script>",
          happenedAt: "2026-09-01T12:00:00.000Z",
          matchedDisplayUrls: ["https://example.com/pricing", null],
        },
      ],
    });

    expect(html).toContain("Possible confounding changes");
    expect(html).toContain("4 Jul 2026 – 30 Oct 2026");
    expect(html).toContain("possible context, not proof");
    expect(html).toContain("Template changed");
    expect(html).toContain("Exact measured page match");
    expect(html).toContain("Matched page URL withheld");
    expect(html).toContain("Site-wide or template effects");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("distinguishes none, overflow, unavailable and closed without a partial list", () => {
    expect(render(base)).toContain(
      "does not show that the comparison was unaffected",
    );
    const overflow = render({ ...base, state: "overflow" });
    expect(overflow).toContain('role="alert"');
    expect(overflow).toContain("partial list is withheld");
    expect(render({ ...base, state: "unavailable" })).toContain(
      "cannot be separated safely",
    );
    expect(render({ ...base, state: "closed" })).toBe("");
  });

  it("renders an explicit redaction without introducing credential text", () => {
    const html = render({
      ...base,
      state: "complete",
      candidates: [
        {
          id: "change_redacted",
          changeType: "technical_fix",
          description: "[redacted: recognised credential material]",
          happenedAt: "2026-09-01T12:00:00.000Z",
          matchedDisplayUrls: ["https://example.com/pricing"],
        },
      ],
    });

    expect(html).toContain("[redacted: recognised credential material]");
    expect(html).toContain("descriptions containing recognised credential");
    expect(html).not.toContain("CONFOUNDER_DESCRIPTION_CANARY_701");
  });
});
