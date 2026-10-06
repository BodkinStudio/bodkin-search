import { z } from "zod";

// The Google Ads learning reads (self-learning ads loop, phase 1): search
// terms, responsive search ad asset ratings, and what each campaign spent
// against what Google counted as a conversion. Read-only GAQL, run through
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

    /**
     * Each campaign's type, spend, clicks and the conversions Google reported,
     * for a date range (account time zone), every campaign that served.
     */
    async campaignResults(
      account: { customerId: string; loginCustomerId: string | null },
      from: string,
      to: string,
    ) {
      const rows = await search(
        account.customerId,
        `SELECT campaign.id, campaign.name, campaign.advertising_channel_type, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}' AND metrics.impressions > 0`,
        account.loginCustomerId,
      );
      const row = z.object({
        campaign: z.object({
          id: z.string(),
          name: z.string().optional(),
          advertisingChannelType: z.string().optional(),
        }),
        metrics: z
          .object({
            costMicros: z.string().optional(),
            clicks: z.string().optional(),
            impressions: z.string().optional(),
            conversions: z.number().optional(),
          })
          .optional(),
      });
      return rows.map((raw) => {
        const r = row.parse(raw);
        return {
          campaignId: r.campaign.id,
          campaignName: r.campaign.name ?? r.campaign.id,
          channelType: r.campaign.advertisingChannelType ?? null,
          spend: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
          clicks: Number(r.metrics?.clicks ?? 0),
          impressions: Number(r.metrics?.impressions ?? 0),
          googleConversions: r.metrics?.conversions ?? 0,
        };
      });
    },

    /**
     * What Google counted as a conversion: per campaign and conversion action,
     * with each action's category and whether bidding optimises for it.
     */
    async conversionBreakdown(
      account: { customerId: string; loginCustomerId: string | null },
      from: string,
      to: string,
    ) {
      const [counted, actions] = await Promise.all([
        search(
          account.customerId,
          `SELECT campaign.name, segments.conversion_action_name, segments.conversion_action_category, metrics.conversions, metrics.all_conversions FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}' AND metrics.all_conversions > 0`,
          account.loginCustomerId,
        ),
        search(
          account.customerId,
          "SELECT conversion_action.name, conversion_action.category, conversion_action.primary_for_goal, conversion_action.type, conversion_action.phone_call_duration_seconds FROM conversion_action WHERE conversion_action.status = 'ENABLED'",
          account.loginCustomerId,
        ),
      ]);
      const countedRow = z.object({
        campaign: z.object({ name: z.string().optional() }).optional(),
        segments: z
          .object({
            conversionActionName: z.string().optional(),
            conversionActionCategory: z.string().optional(),
          })
          .optional(),
        metrics: z
          .object({
            conversions: z.number().optional(),
            allConversions: z.number().optional(),
          })
          .optional(),
      });
      const actionRow = z.object({
        conversionAction: z.object({
          name: z.string().optional(),
          category: z.string().optional(),
          primaryForGoal: z.boolean().optional(),
          type: z.string().optional(),
          phoneCallDurationSeconds: z.string().optional(),
        }),
      });
      return {
        counted: counted.map((raw) => {
          const r = countedRow.parse(raw);
          return {
            campaignName: r.campaign?.name ?? null,
            action: r.segments?.conversionActionName ?? "(unnamed)",
            category: r.segments?.conversionActionCategory ?? null,
            conversions: r.metrics?.conversions ?? 0,
            allConversions: r.metrics?.allConversions ?? 0,
          };
        }),
        actions: actions.flatMap((raw) => {
          const a = actionRow.parse(raw).conversionAction;
          return a.name
            ? [
                {
                  name: a.name,
                  category: a.category ?? null,
                  primary: a.primaryForGoal ?? false,
                  type: a.type ?? null,
                  // Calls shorter than this are not counted (call actions only).
                  minCallSeconds:
                    a.phoneCallDurationSeconds === undefined
                      ? null
                      : Number(a.phoneCallDurationSeconds),
                },
              ]
            : [];
        }),
      };
    },

    /**
     * Every call Google tracked from an ad (its forwarding numbers), started in
     * the range (account time zone): when, how long, answered or missed, and
     * the campaign. No caller details are read.
     */
    async calls(
      account: { customerId: string; loginCustomerId: string | null },
      from: string,
      to: string,
    ) {
      const rows = await search(
        account.customerId,
        `SELECT call_view.start_call_date_time, call_view.call_duration_seconds, call_view.call_status, call_view.type, campaign.name FROM call_view WHERE call_view.start_call_date_time >= '${from} 00:00:00' AND call_view.start_call_date_time <= '${to} 23:59:59'`,
        account.loginCustomerId,
      );
      const row = z.object({
        callView: z.object({
          startCallDateTime: z.string().optional(),
          callDurationSeconds: z.string().optional(),
          callStatus: z.string().optional(),
          type: z.string().optional(),
        }),
        campaign: z.object({ name: z.string().optional() }).optional(),
      });
      return rows.map((raw) => {
        const r = row.parse(raw);
        return {
          startedAt: r.callView.startCallDateTime ?? null,
          seconds: Number(r.callView.callDurationSeconds ?? 0),
          status: r.callView.callStatus ?? null,
          type: r.callView.type ?? null,
          campaignName: r.campaign?.name ?? null,
        };
      });
    },
  };
}
