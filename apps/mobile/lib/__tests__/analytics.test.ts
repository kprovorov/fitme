import { afterEach, describe, expect, it } from "@jest/globals";

import { analytics } from "~/lib/analytics";
import {
  overrideAnalyticsDecision,
  shouldSendAnalytics,
} from "~/lib/analytics-decision";
import { storage } from "~/lib/mmkv";
import { sentAnalytics } from "~/test-utils/fake-analytics";

const RELEASE = { hasKey: true, isDevelopment: false, isE2E: false };

describe("shouldSendAnalytics", () => {
  it("sends from a release build with a key", () => {
    expect(shouldSendAnalytics(RELEASE)).toBe(true);
  });

  it("sends nothing without a key", () => {
    expect(shouldSendAnalytics({ ...RELEASE, hasKey: false })).toBe(false);
  });

  it("sends nothing from a development build", () => {
    expect(shouldSendAnalytics({ ...RELEASE, isDevelopment: true })).toBe(
      false
    );
  });

  it("sends nothing from an E2E build", () => {
    expect(shouldSendAnalytics({ ...RELEASE, isE2E: true })).toBe(false);
  });
});

describe("analytics", () => {
  it("sends an event with its properties", async () => {
    await analytics.send("Plan Saved", { plan_id: "plan-1", source: "arnold" });
    await analytics.send("User Logged In");

    expect(sentAnalytics.events()).toEqual([
      {
        name: "Plan Saved",
        properties: { plan_id: "plan-1", source: "arnold" },
      },
      { name: "User Logged In", properties: undefined },
    ]);
  });

  it("identifies the User with their email and name", async () => {
    await analytics.identify("user_1", { email: "a@example.com", name: "Ann" });

    expect(sentAnalytics.identifies()).toEqual([
      { traits: { email: "a@example.com", name: "Ann" }, userId: "user_1" },
    ]);
  });

  it("resets the identity", async () => {
    await analytics.reset();

    expect(sentAnalytics.resets()).toBe(1);
  });

  it("records a screen by its name", async () => {
    await analytics.screen("/plans/[planId]");

    expect(sentAnalytics.screens()).toEqual(["/plans/[planId]"]);
  });

  it("sends nothing while the decision is off", async () => {
    overrideAnalyticsDecision(false);

    await analytics.send("User Logged Out");
    await analytics.identify("user_1", { email: "a@example.com" });
    await analytics.reset();
    await analytics.screen("/");

    expect(sentAnalytics.events()).toEqual([]);
    expect(sentAnalytics.identifies()).toEqual([]);
    expect(sentAnalytics.resets()).toBe(0);
    expect(sentAnalytics.screens()).toEqual([]);
  });

  it("follows the build once no test overrides it: Jest is a development build", async () => {
    overrideAnalyticsDecision(null);
    process.env.EXPO_PUBLIC_POSTHOG_KEY = "phc_development";

    await analytics.send("User Logged Out");
    await analytics.screen("/");

    expect(sentAnalytics.clients()).toEqual([]);
    expect(sentAnalytics.events()).toEqual([]);
  });

  it("builds no client and sends nothing without a key", async () => {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = "";

    await analytics.send("User Logged Out");
    await analytics.identify("user_1", { email: "a@example.com" });
    await analytics.reset();
    await analytics.screen("/");

    expect(sentAnalytics.clients()).toEqual([]);
    expect(sentAnalytics.events()).toEqual([]);
    expect(sentAnalytics.identifies()).toEqual([]);
    expect(sentAnalytics.resets()).toBe(0);
    expect(sentAnalytics.screens()).toEqual([]);
  });

  it("types every event from the map", () => {
    const typeChecksOnly = () => {
      // @ts-expect-error: not an event the app sends
      void analytics.send("Plan Renamed", { plan_id: "plan-1" });
      // @ts-expect-error: not a property of Plan Saved
      void analytics.send("Plan Saved", { plan: "plan-1", source: "arnold" });
      // @ts-expect-error: Plan Saved needs its properties
      void analytics.send("Plan Saved");
      // @ts-expect-error: User Logged In has no properties
      void analytics.send("User Logged In", { method: "email" });
      // @ts-expect-error: the source is one of two
      void analytics.send("Plan Saved", { plan_id: "plan-1", source: "web" });
    };

    expect(typeChecksOnly).toBeInstanceOf(Function);
  });
});

describe("the client", () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_POSTHOG_HOST;
  });

  it("is built once, with the key and host from the environment", async () => {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = "phc_options";
    process.env.EXPO_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";

    await analytics.send("User Logged In");
    await analytics.screen("/");

    expect(sentAnalytics.clients()).toHaveLength(1);
    expect(sentAnalytics.clients()[0]).toEqual({
      key: "phc_options",
      options: {
        captureAppLifecycleEvents: true,
        customStorage: expect.any(Object),
        enableSessionReplay: false,
        errorTracking: { autocapture: false },
        host: "https://us.i.posthog.com",
        preloadFeatureFlags: false,
      },
    });
  });

  it("leaves the host to the SDK when none is set", async () => {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = "phc_no_host";

    await analytics.send("User Logged In");

    expect(sentAnalytics.clients()[0]?.options?.host).toBeUndefined();
  });

  it("keeps the SDK's state in the app's MMKV storage", async () => {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = "phc_storage";

    await analytics.send("User Logged In");

    const customStorage = sentAnalytics.clients()[0]?.options?.customStorage;
    await customStorage?.setItem(".posthog-rn.json", '{"distinct_id":"x"}');

    expect(storage.getString(".posthog-rn.json")).toBe('{"distinct_id":"x"}');
    expect(customStorage?.getItem(".posthog-rn.json")).toBe(
      '{"distinct_id":"x"}'
    );
    expect(customStorage?.getItem("missing")).toBeNull();
  });
});
