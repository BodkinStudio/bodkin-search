import { describe, expect, it } from "vitest";
import { samChatErrorMessage } from "./samChatError";

describe("SAM provider errors", () => {
  it("distinguishes reserved in-flight credit from an empty balance", () => {
    const message = samChatErrorMessage(
      new Error(
        "This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.",
      ),
    );
    expect(message).toContain("other running requests");
    expect(message).toContain("Wait two minutes");
    expect(message).not.toContain("empty");
  });
  it("recognises insufficient credit and rate limits separately", () => {
    expect(samChatErrorMessage({ message: "Insufficient credits" })).toContain(
      "could not fund",
    );
    expect(samChatErrorMessage(new Error("Rate limit exceeded"))).toContain(
      "limiting requests",
    );
  });
  it("does not display unknown provider payloads or secrets", () => {
    for (const error of [null, {}, new Error("secret-token and stack trace")]) {
      expect(samChatErrorMessage(error)).toContain("SAM couldn’t finish");
      expect(samChatErrorMessage(error)).not.toContain("secret-token");
    }
  });
});
