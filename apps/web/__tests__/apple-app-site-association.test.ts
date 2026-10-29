import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  unstable_doesMiddlewareMatch,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { config } from "../proxy";

const AASA_PATH = "/.well-known/apple-app-site-association";
const APP_ID = "X75M2KSBQL.com.fitmeproject.ios";

describe("apple-app-site-association", () => {
  it("is never run through the Clerk proxy, so a signed-out request gets the file", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: `https://app.fitmeproject.com${AASA_PATH}`,
      })
    ).toBe(false);
  });

  it("leaves every other page behind the proxy", () => {
    for (const path of ["/", "/dashboard", "/well-known", "/api/x"]) {
      expect(
        unstable_doesMiddlewareMatch({
          config,
          url: `https://app.fitmeproject.com${path}`,
        })
      ).toBe(true);
    }
  });

  it("is served as JSON", async () => {
    const response = await unstable_getResponseFromNextConfig({
      nextConfig,
      url: `https://app.fitmeproject.com${AASA_PATH}`,
    });
    expect(response.headers.get("content-type")).toBe("application/json");
  });

  it("names the iOS app for password AutoFill and Handoff", () => {
    const file = JSON.parse(
      readFileSync(join(import.meta.dirname, "../public", AASA_PATH), "utf8")
    );
    expect(file).toEqual({
      activitycontinuation: { apps: [APP_ID] },
      webcredentials: { apps: [APP_ID] },
    });
  });
});
