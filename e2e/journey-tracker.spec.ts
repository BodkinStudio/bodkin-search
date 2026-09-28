import { z } from "zod";
import { expect, test } from "@playwright/test";
import type {
  JourneyConsent,
  JourneyTracker,
  JourneyTrackerOptions,
} from "../src/client/analytics/tracker";
declare global {
  interface Window {
    analyticsTest: {
      tracker: JourneyTracker;
      consent: JourneyConsent;
      listeners: Set<(s: JourneyConsent) => void>;
      options: JourneyTrackerOptions;
    };
    BodkinJourneys: {
      initJourneyTracker: (options: JourneyTrackerOptions) => JourneyTracker;
    };
  }
}
test("consent, ordered navigation, reset and returning sessions", async ({
  page,
}) => {
  const received: {
    name: string;
    contextId: string;
    sessionId: string;
    page?: { path: string };
  }[] = [];
  await page.route("https://example.test/**", async (route) => {
    if (route.request().url().endsWith("/collector")) {
      const body = z
        .object({
          events: z.array(
            z.object({
              name: z.string(),
              contextId: z.string(),
              sessionId: z.string(),
              page: z.object({ path: z.string() }).optional(),
            }),
          ),
        })
        .parse(JSON.parse(route.request().postData() ?? "{}"));
      received.push(...body.events);
      await route.fulfill({ status: 202, body: "{}" });
    } else
      await route.fulfill({
        contentType: "text/html",
        body: '<a href="/next" data-bodkin-event="acquisition_clicked" data-bodkin-action="start_trial" data-bodkin-destination="product">Start</a>',
      });
  });
  await page.goto("https://example.test/");
  await page.addScriptTag({ path: "public/bodkin-journeys.js" });
  await page.evaluate(() => {
    const state = {
      analytics: false,
      attribution: false,
      identity: false,
      policyVersion: "v1",
    };
    const listeners = new Set<(s: JourneyConsent) => void>();
    const options: JourneyTrackerOptions = {
      projectKey: "key",
      sourceId: "source",
      collectorUrl: "https://example.test/collector",
      consent: {
        getState: () => window.analyticsTest?.consent ?? state,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      },
    };
    const tracker = window.BodkinJourneys.initJourneyTracker(options);
    window.analyticsTest = { tracker, consent: state, listeners, options };
  });
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(received).toEqual([]);
  await page.evaluate(() => {
    history.pushState({}, "", "/before-consent");
    const t = window.analyticsTest;
    t.consent = {
      analytics: true,
      attribution: true,
      identity: true,
      policyVersion: "v1",
    };
    t.listeners.forEach((l) => l(t.consent));
    return t.tracker.flush();
  });
  expect(received.map((e) => e.page?.path)).toEqual(["/before-consent"]);
  const first = received[0];
  await page.evaluate(() => {
    history.pushState({}, "", "/pricing");
    history.replaceState({}, "", "/pricing");
    window.dispatchEvent(new PopStateEvent("popstate"));
    return window.analyticsTest.tracker.flush();
  });
  expect(received.filter((e) => e.page?.path === "/pricing")).toHaveLength(1);
  await page.evaluate(() => {
    const t = window.analyticsTest;
    t.tracker.destroy();
    t.tracker = window.BodkinJourneys.initJourneyTracker(t.options);
    return t.tracker.flush();
  });
  expect(received.filter((e) => e.page?.path === "/pricing")).toHaveLength(1);
  await page.evaluate(() => {
    const t = window.analyticsTest;
    t.tracker.destroy();
    const key = "bodkin-journey:key:source:production";
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      !saved ||
      typeof saved !== "object" ||
      !("lastActivity" in saved) ||
      typeof saved.lastActivity !== "number"
    )
      throw new Error("Missing persisted session");
    saved.lastActivity -= 1800001;
    localStorage.setItem(key, JSON.stringify(saved));
    t.tracker = window.BodkinJourneys.initJourneyTracker(t.options);
    t.tracker.track("product_opened");
  });
  await expect
    .poll(() => received.some((e) => e.name === "product_opened"))
    .toBe(true);
  const product = received.find((e) => e.name === "product_opened")!;
  expect(product.contextId).toBe(first.contextId);
  expect(product.sessionId).not.toBe(first.sessionId);
  await page.evaluate(() => {
    const t = window.analyticsTest;
    t.tracker.reset();
    t.tracker.track("product_opened");
  });
  await expect
    .poll(() => received.filter((e) => e.name === "product_opened").length)
    .toBe(2);
  expect(received.at(-1)?.contextId).not.toBe(first.contextId);
  await page.evaluate(() => {
    const t = window.analyticsTest;
    t.consent = {
      analytics: false,
      attribution: false,
      identity: false,
      policyVersion: "v2",
    };
    t.listeners.forEach((l) => l(t.consent));
    t.tracker.track("acquisition_clicked", {
      action: "start_trial",
      destination: "product",
    });
  });
  await expect
    .poll(() => received.some((e) => e.name === "consent_withdrawn"))
    .toBe(true);
  expect(received.filter((e) => e.name === "acquisition_clicked")).toHaveLength(
    0,
  );
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
