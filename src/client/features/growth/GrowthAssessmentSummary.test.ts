import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GrowthAssessmentSummary } from "./GrowthAssessmentSummary";

type Assessment = ComponentProps<typeof GrowthAssessmentSummary>["assessment"];
const assessment: Assessment = {
  id: "assessment",
  projectId: "project",
  version: 3,
  status: "draft",
  objective: "Understand customer demand",
  market: "US",
  audience: "Business buyers",
  successMeasure:
    "Identify the landing page and whether conversion tracking exists.",
  objectiveConfirmed: false,
  comparisonRationale: "Resolve this evidence gap first.",
  selectedOptionId: "option",
  createdAt: "2026-09-11T00:00:00Z",
  options: [
    {
      id: "option",
      projectId: "project",
      assessmentId: "assessment",
      ordinal: 0,
      kind: "measurement",
      title: "Find the page receiving browser SMS searches",
      businessRelevance:
        "Check whether these searches could bring business buyers.",
      nextValidation: "Filter Search Console by sms browser and open Pages.",
      evidenceSource:
        "Saved gsc_period Growth signal abcdefab-abcd-abcd-abcd-abcdefabcdef",
      evidenceDate: "2026-09-01T00:00:00Z",
      evidenceScope: "US desktop",
      observation:
        "gsc_impressions on search_query sms browser: 2947 to 4777 (1830, 62.097)%\n\nSecond complete source record.",
      uncertainty: "The landing page and conversions are unknown.",
      disposition: "selected",
      keyPageId: null,
    },
  ],
};
function render(value = assessment) {
  return renderToStaticMarkup(
    createElement(GrowthAssessmentSummary, {
      assessment: value,
      projectId: "project",
      keyPages: [],
      onEdit: () => {},
    }),
  );
}
describe("Growth decision brief", () => {
  it.each([
    {
      observation:
        "Keyword teams sms ranked 15 on desktop; result URL https://yakchat.com/post.",
      evidenceScope: "US desktop",
    },
    {
      observation: "Clicks changed from 10 to 20.",
      evidenceScope:
        "Canonical affected page: https://yakchat.com/post. Saved period.",
    },
    {
      observation: "Missing title (high) on https://yakchat.com/post.",
      evidenceScope: "Saved audit",
    },
  ])(
    "links to the canonical cited page for rank, signal and audit evidence",
    (evidence) => {
      const html = render({
        ...assessment,
        options: [{ ...assessment.options[0], ...evidence }],
      });
      expect(html).toContain('href="https://yakchat.com/post"');
      expect(html).toContain("Open cited page");
    },
  );
  it("leads with a proposed task while preserving full original evidence behind disclosure", () => {
    const html = render();
    expect(html).toContain("Suggested investigation");
    expect(html.indexOf("Filter Search Console")).toBeLessThan(
      html.indexOf("What supports this"),
    );
    expect(html).toContain("Review this investigation");
    expect(html).not.toContain("Agreed investigation");
    expect(html).toContain("Second complete source record.");
    expect(html).toContain("abcdefab-abcd-abcd-abcd-abcdefabcdef");
    expect(html).toContain("US desktop");
    expect(html).toContain('href="#growth-run-inspector"');
    expect(html).not.toContain("<details open");
  });
  it("labels agreement separately from a draft and distinguishes page work", () => {
    expect(render({ ...assessment, status: "ready" })).toContain(
      "Agreed investigation",
    );
    const page = render({
      ...assessment,
      options: [{ ...assessment.options[0], kind: "page" }],
    });
    expect(page).toContain("Suggested page work");
    expect(page).toContain("Review this proposal");
    expect(page).not.toContain("Agreed direction");
  });
});
