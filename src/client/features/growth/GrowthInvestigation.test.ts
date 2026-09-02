import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { GrowthInvestigationView } from "@/types/schemas/growth-investigations";
import {
  GrowthInvestigation,
  GrowthInvestigationReview,
} from "./GrowthInvestigation";
import { GrowthInvestigationForm } from "./GrowthInvestigationForm";
import {
  GrowthInvestigationReviewControls,
  GrowthInvestigationValidationFailure,
  nextUtcCalendarDate,
} from "./GrowthInvestigationReviewControls";

vi.mock("@/serverFunctions/growthInvestigations", () => ({
  getGrowthInvestigation: vi.fn(),
  approveGrowthInvestigation: vi.fn(),
  reviewGrowthInvestigation: vi.fn(),
}));

const proposal: GrowthInvestigationView = {
  relationship: "controller",
  recommendationId: "recommendation_1",
  title: "Investigate the saved pricing-page decline",
  rationale: "Clicks declined from 308 to 140. The cause remains unknown.",
  steps: [
    "Review the saved query evidence.",
    "Check known changes before deciding what to change.",
  ],
  displayUrls: ["https://example.com/pricing"],
  status: "proposed",
  reviewVersion: 0,
  dismissalReason: null,
  snoozedUntil: null,
  actionId: null,
  dueOn: null,
  templateVersion: "priority-page-investigation-v1",
};

function queryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryOnMount: false, staleTime: Infinity },
    },
  });
}
function render(
  client: QueryClient,
  projectId = "project_1",
  signalId = "signal_1",
) {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(GrowthInvestigationReview, { projectId, signalId }),
    ),
  );
}

describe("Growth investigation rendered contract", () => {
  it("does not mount the query or approval form before the disclosure is opened", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthInvestigation, {
        projectId: "project_1",
        signalId: "signal_1",
      }),
    );
    expect(html).toContain("<details");
    expect(html).toContain("Review investigation");
    expect(html).not.toContain("Approve investigation");
  });

  it("uses a named pending state", () => {
    expect(render(queryClient())).toContain("Loading saved investigation");
    expect(render(queryClient())).toContain('aria-busy="true"');
  });

  it("explains absent legacy suggestions without claiming regeneration", () => {
    const client = queryClient();
    client.setQueryData(["growthInvestigation", "project_1", "signal_1"], null);
    const html = render(client);
    expect(html).toContain("This check has no saved investigation");
    expect(html).toContain("older results are not rewritten");
    expect(html).not.toContain("Approve investigation");
  });

  it("shows the stored proposal, scope warning and an explicit due-date approval", () => {
    const client = queryClient();
    client.setQueryData(
      ["growthInvestigation", "project_1", "signal_1"],
      proposal,
    );
    const html = render(client);
    expect(html).toContain(proposal.title);
    expect(html).toContain(proposal.rationale);
    expect(html).toContain("No AI was used");
    expect(html).toContain(
      "This suggestion covers later checks for the same saved page",
    );
    expect(html).toContain("Due date (UTC)");
    expect(html).toContain("Approve investigation");
    expect(html).toContain("Dismissal reason");
    expect(html).toContain("Snooze until (UTC)");
    expect(html).toContain('aria-label="Dismiss this suggestion"');
    expect(html).toContain('aria-label="Snooze this suggestion"');
    expect(html).toContain('required=""');
    expect(html).toContain(`min="${nextUtcCalendarDate()}"`);
    expect(html.indexOf("Approve investigation")).toBeLessThan(
      html.indexOf("Dismissal reason"),
    );
    expect(html.indexOf("Dismissal reason")).toBeLessThan(
      html.indexOf("Snooze until (UTC)"),
    );
    expect(html).toContain("does not change the website");
    expect(html).not.toContain("Expected uplift");
  });

  it("shows repeated evidence as covered without exposing old evidence or review controls", () => {
    const client = queryClient();
    client.setQueryData(["growthInvestigation", "project_1", "signal_1"], {
      relationship: "suppressed",
      recommendationId: "recommendation_1",
      title: "Investigate the earlier pricing-page decline",
      status: "accepted",
      suppressionReason: "existing_action",
      policyVersion: "priority-page-repeat-suppression-v1",
      actionId: "action_1",
      dueOn: "2026-09-04",
    } satisfies GrowthInvestigationView);
    const html = render(client);
    expect(html).toContain("Covered by an existing suggestion");
    expect(html).toContain(
      "This check was saved as new evidence without creating another",
    );
    expect(html).toContain("existing work already covered this issue");
    expect(html).toContain("Due 4 Sept 2026 (UTC)");
    expect(html).toContain('href="#growth-work"');
    expect(html).not.toContain(proposal.rationale);
    expect(html).not.toContain("Approve investigation");
    expect(html).not.toContain("Dismissal reason");
    expect(html).not.toContain("Review now");
  });

  it("does not display cached suggestions from another project or signal", () => {
    const client = queryClient();
    client.setQueryData(
      ["growthInvestigation", "project_1", "signal_1"],
      proposal,
    );
    expect(render(client, "project_2")).not.toContain(proposal.rationale);
    expect(render(client, "project_1", "signal_2")).not.toContain(
      proposal.rationale,
    );
  });

  it("shows persisted approval after a fresh render without offering a second approval", () => {
    const client = queryClient();
    client.setQueryData(["growthInvestigation", "project_1", "signal_1"], {
      ...proposal,
      status: "accepted",
      actionId: "action_1",
      dueOn: "2026-09-04",
    });
    const html = render(client);
    expect(html).toContain("This investigation is in your work list");
    expect(html).toContain("Due 4 Sept 2026 (UTC)");
    expect(html).toContain('href="#growth-work"');
    expect(html).not.toContain("Approve investigation");
  });

  it("flags an older incomplete approval without inventing a date or offering a retry", () => {
    const client = queryClient();
    client.setQueryData(["growthInvestigation", "project_1", "signal_1"], {
      ...proposal,
      status: "accepted",
    });
    const html = render(client);
    expect(html).toContain("This older approval has no saved action");
    expect(html).toContain("approving user were not recorded");
    expect(html).toContain("project administrator");
    expect(html).not.toContain("Approve investigation");
    expect(html).not.toContain("Retry approval");
    expect(html).not.toContain('type="date"');
  });

  it("does not offer approval for a dismissed suggestion and escapes source text", () => {
    const client = queryClient();
    client.setQueryData(["growthInvestigation", "project_1", "signal_1"], {
      ...proposal,
      status: "dismissed",
      reviewVersion: 1,
      dismissalReason: "wrong_diagnosis",
      title: "<script>unsafe</script>",
      displayUrls: [null],
    });
    const html = render(client);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Saved page URL withheld");
    expect(html).toContain("dismissed as wrong diagnosis");
    expect(html).toContain("read-only");
    expect(html).not.toContain("Approve investigation");
    expect(html).not.toContain("Review now");
  });

  it("shows the saved snooze and offers only an explicit review-now transition", () => {
    const client = queryClient();
    client.setQueryData(["growthInvestigation", "project_1", "signal_1"], {
      ...proposal,
      status: "snoozed",
      reviewVersion: 1,
      snoozedUntil: "2026-09-04T00:00:00.000Z",
    });
    const html = render(client);
    expect(html).toContain("snoozed until 4 Sept 2026 (UTC)");
    expect(html).toContain("Review now");
    expect(html).not.toContain("Approve investigation");
    expect(html).not.toContain("Dismissal reason");
  });

  it.each(["merged", "superseded"] as const)(
    "keeps %s suggestions read-only",
    (status) => {
      const client = queryClient();
      client.setQueryData(["growthInvestigation", "project_1", "signal_1"], {
        ...proposal,
        status,
        reviewVersion: 1,
      });
      const html = render(client);
      expect(html).toContain(`${status} and is read-only`);
      expect(html).not.toContain("Approve investigation");
      expect(html).not.toContain("Review now");
    },
  );

  it("gives a read error recovery without exposing internal details", async () => {
    const client = queryClient();
    await client
      .fetchQuery({
        queryKey: ["growthInvestigation", "project_1", "signal_1"],
        queryFn: () => Promise.reject(new Error("private database details")),
      })
      .catch(() => undefined);
    const html = render(client);
    expect(html).toContain("Retry investigation");
    expect(html).not.toContain("private database details");
  });

  it("labels the required native date field and locks it during an uncertain save", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthInvestigationForm, {
        disabled: true,
        pending: true,
        onSubmit: vi.fn(),
      }),
    );
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain('type="date"');
    expect(html).toContain('required=""');
    expect(html).toContain("<label ");
    expect(html).toContain("aria-describedby");
    expect(html).toContain("Saving approved work");
  });

  it("locks every native review fieldset while a review is pending", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthInvestigationReviewControls, {
        disabled: true,
        pending: true,
        onDismiss: vi.fn(),
        onSnooze: vi.fn(),
      }),
    );
    expect(html.match(/<fieldset disabled=""/g)).toHaveLength(2);
    expect(html).toContain('type="date"');
    expect(html).toContain("Saving review");
    expect(nextUtcCalendarDate(new Date("2026-12-31T23:59:59.000Z"))).toBe(
      "2027-01-01",
    );
  });

  it("surfaces a safe validation failure without internal details", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthInvestigationValidationFailure, {
        error: new Error("VALIDATION_ERROR"),
      }),
    );
    expect(html).toContain("Please check your input and try again");
    expect(html).toContain("Choose a new future UTC date");
    expect(html).not.toContain("Retry review");
    expect(html).not.toContain("database");
  });
});
