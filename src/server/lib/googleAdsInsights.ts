import { z } from "zod";

// The Google Ads learning reads (self-learning ads loop, phase 1): search
// terms and responsive search ad asset ratings. Read-only GAQL, run through
// the client's own search.

type Search = (
  customerId: string,
  query: string,
  loginCustomerId?: string | null,
) => Promise<Record<string, unknown>[]>;

export function adsInsightQueries(search: Search) {
  return {
    /**
     * What people typed before clicking a search ad (Search campaigns; Performance
     * Max does not report individual terms here), with the keyword that matched,
     * for a date range in the account time zone. Biggest spend first.
     */
    async searchTerms(
      account: { customerId: string; loginCustomerId: string | null },
      from: string,
      to: string,
    ) {
      const rows = await search(
        account.customerId,
        `SELECT search_term_view.search_term, search_term_view.status, segments.keyword.info.text, segments.keyword.info.match_type, campaign.id, campaign.name, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date BETWEEN '${from}' AND '${to}' AND metrics.impressions > 0 ORDER BY metrics.cost_micros DESC LIMIT 500`,
        account.loginCustomerId,
      );
      const row = z.object({
        searchTermView: z.object({
          searchTerm: z.string(),
          status: z.string().optional(),
        }),
        segments: z
          .object({
            keyword: z
              .object({
                info: z
                  .object({
                    text: z.string().optional(),
                    matchType: z.string().optional(),
                  })
                  .optional(),
              })
              .optional(),
          })
          .optional(),
        campaign: z.object({ id: z.string(), name: z.string().optional() }),
        adGroup: z.object({ name: z.string().optional() }).optional(),
        metrics: z
          .object({
            impressions: z.string().optional(),
            clicks: z.string().optional(),
            costMicros: z.string().optional(),
            conversions: z.number().optional(),
          })
          .optional(),
      });
      return rows.map((raw) => {
        const r = row.parse(raw);
        return {
          searchTerm: r.searchTermView.searchTerm,
          status: r.searchTermView.status ?? null,
          keyword: r.segments?.keyword?.info?.text ?? null,
          matchType: r.segments?.keyword?.info?.matchType ?? null,
          campaignId: r.campaign.id,
          campaignName: r.campaign.name ?? r.campaign.id,
          adGroupName: r.adGroup?.name ?? null,
          impressions: Number(r.metrics?.impressions ?? 0),
          clicks: Number(r.metrics?.clicks ?? 0),
          spend: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
          googleConversions: r.metrics?.conversions ?? 0,
        };
      });
    },

    /**
     * Google's rating (Best / Good / Low / Learning) of each headline and
     * description in responsive search ads, with its impressions and clicks.
     */
    async assetRatings(
      account: { customerId: string; loginCustomerId: string | null },
      from: string,
      to: string,
    ) {
      const rows = await search(
        account.customerId,
        `SELECT ad_group_ad_asset_view.field_type, ad_group_ad_asset_view.performance_label, asset.text_asset.text, campaign.name, ad_group.name, metrics.impressions, metrics.clicks FROM ad_group_ad_asset_view WHERE segments.date BETWEEN '${from}' AND '${to}' AND ad_group_ad_asset_view.field_type IN ('HEADLINE', 'DESCRIPTION') AND metrics.impressions > 0`,
        account.loginCustomerId,
      );
      const row = z.object({
        adGroupAdAssetView: z.object({
          fieldType: z.string().optional(),
          performanceLabel: z.string().optional(),
        }),
        asset: z
          .object({
            textAsset: z.object({ text: z.string().optional() }).optional(),
          })
          .optional(),
        campaign: z.object({ name: z.string().optional() }).optional(),
        adGroup: z.object({ name: z.string().optional() }).optional(),
        metrics: z
          .object({
            impressions: z.string().optional(),
            clicks: z.string().optional(),
          })
          .optional(),
      });
      return rows.flatMap((raw) => {
        const r = row.parse(raw);
        const text = r.asset?.textAsset?.text;
        if (!text) return [];
        return [
          {
            text,
            fieldType: r.adGroupAdAssetView.fieldType ?? null,
            rating: r.adGroupAdAssetView.performanceLabel ?? null,
            campaignName: r.campaign?.name ?? null,
            adGroupName: r.adGroup?.name ?? null,
            impressions: Number(r.metrics?.impressions ?? 0),
            clicks: Number(r.metrics?.clicks ?? 0),
          },
        ];
      });
    },
  };
}
