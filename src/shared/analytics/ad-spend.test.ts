import { describe, expect, it } from "vitest";
import { attributeSpend } from "@/shared/analytics/ad-spend";

const campaigns = [
  {
    campaignId: "111",
    campaignName: "Teams SMS UK",
    spend: 200,
    clicks: 80,
    impressions: 3000,
  },
  {
    campaignId: "222",
    campaignName: "Brand",
    spend: 40,
    clicks: 30,
    impressions: 500,
  },
];

describe("attributeSpend", () => {
  it("places leads by resolved click, then by UTM campaign name (any case) or id, and prices each campaign", () => {
    const result = attributeSpend(campaigns, [
      { kind: "enquiry", utmCampaign: null, adCampaignId: "111" },
      { kind: "trial", utmCampaign: "teams sms uk", adCampaignId: null },
      { kind: "enquiry", utmCampaign: "222", adCampaignId: null },
      { kind: "enquiry", utmCampaign: "newsletter", adCampaignId: null },
    ]);
    expect(result).toMatchObject({ spend: 240, mqls: 3, costPerMql: 80 });
    expect(result.campaigns).toEqual([
      expect.objectContaining({
        campaignName: "Teams SMS UK",
        mqls: 2,
        enquiries: 1,
        trials: 1,
        costPerMql: 100,
      }),
      expect.objectContaining({
        campaignName: "Brand",
        mqls: 1,
        costPerMql: 40,
      }),
    ]);
  });

  it("has no cost per lead when spend brought no leads", () => {
    expect(attributeSpend(campaigns, [])).toMatchObject({
      mqls: 0,
      costPerMql: null,
    });
  });
});
