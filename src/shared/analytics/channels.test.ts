import { describe, expect, it } from "vitest";
import { channelFor } from "@/shared/analytics/channels";

describe("channelFor", () => {
  it.each([
    [{ clickIdType: "gclid" }, "Paid search"],
    [{ campaignSource: "google", campaignMedium: "cpc" }, "Paid search"],
    [{ campaignSource: "linkedin", campaignMedium: "paid" }, "Paid social"],
    [
      { clickIdType: "fbclid", referrerHost: "l.facebook.com" },
      "Organic social",
    ],
    [{ referrerHost: "www.google.com" }, "Organic search"],
    [{ referrerHost: "chatgpt.com" }, "AI answer"],
    [{ referrerHost: "gemini.google.com" }, "AI answer"],
    [{ campaignSource: "chatgpt.com" }, "AI answer"],
    [{ referrerHost: "www.linkedin.com" }, "Organic social"],
    [{ campaignMedium: "email", campaignSource: "newsletter" }, "Email"],
    [{ referrerHost: "partner.example.com" }, "Referral"],
    [{ referrerHost: "www.yakchat.com", pageHost: "yakchat.com" }, "Direct"],
    [{}, "Direct"],
  ])("%o is %s", (touch, channel) => {
    expect(channelFor(touch)).toBe(channel);
  });
});
