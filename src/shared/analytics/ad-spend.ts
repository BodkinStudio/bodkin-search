// Spend per campaign beside the qualified leads it brought: a lead belongs to
// a campaign by its resolved ad click, else by its UTM campaign matching the
// campaign's name (any case) or id.

type Campaign = {
  campaignId: string;
  campaignName: string;
  spend: number;
  clicks: number;
  impressions: number;
};
export type SpendLead = {
  kind: "enquiry" | "trial" | "other";
  utmCampaign: string | null;
  adCampaignId: string | null;
};

const round = (n: number) => Math.round(n * 100) / 100;

export function attributeSpend(campaigns: Campaign[], leads: SpendLead[]) {
  const byKey = new Map<string, Campaign>();
  for (const c of campaigns) {
    byKey.set(c.campaignId, c);
    byKey.set(c.campaignName.trim().toLowerCase(), c);
  }
  const counts = new Map<
    string,
    { mqls: number; enquiries: number; trials: number }
  >();
  let attributed = 0;
  for (const lead of leads) {
    const campaign =
      (lead.adCampaignId ? byKey.get(lead.adCampaignId) : undefined) ??
      (lead.utmCampaign
        ? (byKey.get(lead.utmCampaign) ??
          byKey.get(lead.utmCampaign.trim().toLowerCase()))
        : undefined);
    if (!campaign) continue;
    attributed++;
    const c = counts.get(campaign.campaignId) ?? {
      mqls: 0,
      enquiries: 0,
      trials: 0,
    };
    c.mqls++;
    if (lead.kind === "enquiry") c.enquiries++;
    if (lead.kind === "trial") c.trials++;
    counts.set(campaign.campaignId, c);
  }
  const spend = campaigns.reduce((sum, c) => sum + c.spend, 0);
  return {
    spend: round(spend),
    clicks: campaigns.reduce((sum, c) => sum + c.clicks, 0),
    mqls: attributed,
    costPerMql: attributed ? round(spend / attributed) : null,
    campaigns: campaigns
      .map((c) => {
        const n = counts.get(c.campaignId) ?? {
          mqls: 0,
          enquiries: 0,
          trials: 0,
        };
        return {
          ...c,
          spend: round(c.spend),
          ...n,
          costPerMql: n.mqls ? round(c.spend / n.mqls) : null,
        };
      })
      .toSorted((a, b) => b.spend - a.spend),
  };
}
