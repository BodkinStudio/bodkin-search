import { describe, expect, it } from "vitest";
import { adsScorecard, summariseCalls } from "./ads-scorecard";

const site = (
  label: string,
  visitors: number,
  signedUp = 0,
  leads = 0,
  trial = 0,
) => ({
  label,
  visitors,
  clicked: { start_trial: trial, book_demo: 0, contact: 0 },
  signedUp,
  leads,
});

const input = {
  campaigns: [
    {
      campaignId: "1",
      campaignName: "Website traffic-Performance Max-4",
      channelType: "PERFORMANCE_MAX",
      spend: 910,
      clicks: 356,
      impressions: 40000,
      googleConversions: 120,
    },
    {
      campaignId: "2",
      campaignName: "Brand - Revised RWD",
      channelType: "SEARCH",
      spend: 169,
      clicks: 108,
      impressions: 900,
      googleConversions: 21,
    },
  ],
  siteCampaigns: [
    site("website traffic-performance max-4", 8, 0, 0, 2),
    site("2", 3, 1, 1),
  ],
  siteChannels: [
    site("Paid search", 12, 1, 1, 2),
    site("Organic search", 713, 6, 0, 113),
    site("Direct", 1223, 1, 0, 22),
  ],
  counted: [
    {
      campaignName: "Website traffic-Performance Max-4",
      action: "Page view: pricing",
      category: "PAGE_VIEW",
      conversions: 110,
      allConversions: 115,
    },
    {
      campaignName: "Brand - Revised RWD",
      action: "Page view: pricing",
      category: "PAGE_VIEW",
      conversions: 20,
      allConversions: 20,
    },
    {
      campaignName: "Website traffic-Performance Max-4",
      action: "Demo form",
      category: "SUBMIT_LEAD_FORM",
      conversions: 11,
      allConversions: 11,
    },
  ],
  actions: [
    { name: "Page view: pricing", category: "PAGE_VIEW", primary: true },
    { name: "Demo form", category: "SUBMIT_LEAD_FORM", primary: true },
    {
      name: "Calls from ads",
      category: "PHONE_CALL_LEAD",
      primary: true,
      minCallSeconds: 0,
    },
  ],
};

describe("adsScorecard", () => {
  it("joins every campaign Google billed to what the site saw its visitors do, by name or id", () => {
    const { campaigns } = adsScorecard(input);
    expect(campaigns[0]).toMatchObject({
      campaignName: "Website traffic-Performance Max-4",
      type: "Performance Max",
      spend: 910,
      costPerClick: 2.56,
      googleConversions: 120,
      costPerGoogleConversion: 7.58,
      visitorsSeen: 8,
      seenRate: 2.2,
      startTrialClicks: 2,
      signedUp: 0,
      costPerSignUp: null,
      leads: 0,
      costPerLead: null,
    });
    expect(campaigns[1]).toMatchObject({
      type: "Search",
      leads: 1,
      costPerLead: 169,
    });
  });

  it("totals spend against Google's conversions and the site's sign-ups and leads", () => {
    expect(adsScorecard(input).totals).toMatchObject({
      spend: 1079,
      clicks: 464,
      googleConversions: 141,
      visitorsSeen: 11,
      signedUp: 1,
      costPerSignUp: 1079,
      leads: 1,
      costPerLead: 1079,
    });
  });

  it("shows what Google counts as a conversion, and how much of what bidding chases is a lead, a call or neither", () => {
    const calls = {
      name: "Calls from ads",
      category: "PHONE_CALL_LEAD",
      primary: true,
      minCallSeconds: 0,
    };
    const { conversionActions, totals } = adsScorecard({
      ...input,
      counted: [
        ...input.counted,
        {
          campaignName: "Website traffic-Performance Max-4",
          action: "Calls from ads",
          category: "PHONE_CALL_LEAD",
          conversions: 17,
          allConversions: 17,
        },
      ],
      actions: [...input.actions, calls],
    });
    expect(conversionActions).toEqual([
      {
        action: "Page view: pricing",
        category: "Page view",
        kind: "other",
        usedForBidding: true,
        minCallSeconds: null,
        conversions: 130,
        allConversions: 135,
      },
      {
        action: "Calls from ads",
        category: "Phone call",
        kind: "call",
        usedForBidding: true,
        minCallSeconds: 0,
        conversions: 17,
        allConversions: 17,
      },
      {
        action: "Demo form",
        category: "Lead form",
        kind: "lead",
        usedForBidding: true,
        minCallSeconds: null,
        conversions: 11,
        allConversions: 11,
      },
    ]);
    expect(totals).toMatchObject({
      biddingConversions: 158,
      biddingOnLeadsRate: 7,
      biddingOnCallsRate: 10.8,
      biddingOnOtherRate: 82.3,
    });
  });

  it("compares ad visitors with organic search and everything else on the same measures", () => {
    expect(adsScorecard(input).comparison).toEqual([
      {
        channel: "Ads",
        visitors: 12,
        startTrialRate: 16.7,
        bookDemoRate: 0,
        signedUp: 1,
        signUpRate: 8.3,
        leads: 1,
      },
      {
        channel: "Organic search",
        visitors: 713,
        startTrialRate: 15.8,
        bookDemoRate: 0,
        signedUp: 6,
        signUpRate: 0.8,
        leads: 0,
      },
      {
        channel: "Everything else",
        visitors: 1223,
        startTrialRate: 1.8,
        bookDemoRate: 0,
        signedUp: 1,
        signUpRate: 0.1,
        leads: 0,
      },
    ]);
  });

  it("never divides by zero: no clicks or visitors read as unknown, not zero", () => {
    const empty = adsScorecard({
      campaigns: [],
      siteCampaigns: [],
      siteChannels: [],
      counted: [],
      actions: [],
    });
    expect(empty.totals).toMatchObject({
      spend: 0,
      costPerClick: null,
      seenRate: null,
      costPerLead: null,
      biddingOnLeadsRate: null,
    });
  });
});

describe("summariseCalls", () => {
  it("counts answered, missed and short calls, the median length, by campaign, and the lowest counted call length", () => {
    const calls = summariseCalls(
      [
        {
          startedAt: "2026-10-01 09:00:00",
          seconds: 4,
          status: "RECEIVED",
          campaignName: "PMax",
        },
        {
          startedAt: "2026-10-02 09:00:00",
          seconds: 0,
          status: "MISSED",
          campaignName: "PMax",
        },
        {
          startedAt: "2026-10-03 09:00:00",
          seconds: 12,
          status: "RECEIVED",
          campaignName: "PMax",
        },
        {
          startedAt: "2026-10-04 09:00:00",
          seconds: 240,
          status: "RECEIVED",
          campaignName: "Brand",
        },
      ],
      [
        {
          name: "Calls from ads",
          category: "PHONE_CALL_LEAD",
          primary: true,
          minCallSeconds: 0,
        },
        {
          name: "Demo form",
          category: "SUBMIT_LEAD_FORM",
          primary: true,
          minCallSeconds: null,
        },
      ],
    );
    expect(calls).toMatchObject({
      total: 4,
      answered: 3,
      missed: 1,
      short: 2,
      medianSeconds: 12,
      minCallSeconds: 0,
    });
    expect(calls.byCampaign).toEqual([
      { campaignName: "PMax", calls: 3, answered: 2, medianSeconds: 8 },
      { campaignName: "Brand", calls: 1, answered: 1, medianSeconds: 240 },
    ]);
    expect(calls.recent[0]).toEqual({
      startedAt: "2026-10-04 09:00:00",
      seconds: 240,
      answered: true,
      campaignName: "Brand",
    });
  });

  it("with no calls, reads as none rather than zero-length", () => {
    expect(summariseCalls([], [])).toMatchObject({
      total: 0,
      medianSeconds: null,
      minCallSeconds: null,
    });
  });
});
