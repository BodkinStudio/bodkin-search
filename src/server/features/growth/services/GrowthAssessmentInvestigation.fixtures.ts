export const validInvestigationProposal = {
  verdict: "investigate",
  headline: "Verify the page's query demand before changing it",
  whyThisPage:
    "The accepted assessment selected this exact page, but its commercial goal is not confirmed.",
  rationale:
    "The readable content describes Teams SMS, while page-level query evidence is unavailable.",
  nextAction:
    "Connect Search Console and collect the exact page's query report before choosing a content change.",
  expectedOutcome:
    "A decision on whether the page serves a relevant search opportunity or should be deprioritised.",
  measurement:
    "Review the exact-page query report and record the selected verdict.",
  caveat:
    "This does not establish visitor intent, conversion, or a commercial goal.",
};

export const searchEvidenceFixture = {
  asOf: "2026-09-11T10:00:00.000Z",
  searchPerformance: {
    state: "available",
    startDate: "2026-08-13",
    endDate: "2026-09-09",
    aggregate: {
      state: "reported",
      clicks: 9,
      impressions: 3605,
      ctr: 9 / 3605,
      position: 12.374,
    },
    queries: {
      items: [
        {
          query: { value: "can i text from microsoft teams" },
          clicks: 0,
          impressions: 8,
          ctr: 0,
          position: 18.25,
        },
        {
          query: { value: "can i text from teams" },
          clicks: 0,
          impressions: 17,
          ctr: 0,
          position: 19.176,
        },
      ],
    },
  },
};
