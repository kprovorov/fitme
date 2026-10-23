import { randomBytes } from "node:crypto";
import { profiles, withService } from "@fitme/db";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import { clerk, signedInAs } from "../src/test/harness.js";

/**
 * The app with the real services facade, through `asUser` on the local
 * stack's pooler (FITME_DATABASE_URL, set by the vitest config), as made-up
 * Clerk-style User ids with test-signed session tokens. Every query goes
 * through the same RLS policies as in production.
 */
const app = createApp({
  clerkJwtKey: clerk.jwtKey,
  createServices: createServicesFromEnv,
  identifyUser: () => undefined,
  reportError: (error) => Promise.reject(error),
});

/** A made-up id in Clerk's `user_…` format, unique per run. */
const testUserId = (label: string) =>
  `user_${label}${randomBytes(16).toString("hex")}`;

const withProfile = testUserId("profile");
const imperial = testUserId("imperial");
const withoutProfile = testUserId("noprofile");

/** The status and body of `GET /v1/profile` as `userId`. */
const getProfile = async (userId: string) => {
  const response = await app.request("/v1/profile", {
    headers: signedInAs(userId),
  });
  return { body: await response.json(), status: response.status };
};

beforeAll(async () => {
  await withService((tx) =>
    tx.insert(profiles).values([
      {
        age: 30,
        gender: "female",
        height: "170.5",
        measurementSystem: "metric",
        userId: withProfile,
        weight: "60.25",
      },
      {
        age: 41,
        gender: "male",
        height: "70",
        measurementSystem: "us",
        userId: imperial,
        weight: "180",
      },
    ])
  );
});

afterAll(async () => {
  await withService((tx) =>
    tx.delete(profiles).where(inArray(profiles.userId, [withProfile, imperial]))
  );
});

describe("GET /v1/profile against the local stack", () => {
  it("reads the signed-in User's Profile with its units", async () => {
    expect(await getProfile(withProfile)).toEqual({
      body: {
        data: {
          age: 30,
          gender: "female",
          height: 170.5,
          measurement_system: "metric",
          units: { height: "cm", weight: "kg" },
          weight: 60.25,
        },
      },
      status: 200,
    });
    expect(await getProfile(imperial)).toEqual({
      body: {
        data: {
          age: 41,
          gender: "male",
          height: 70,
          measurement_system: "us",
          units: { height: "in", weight: "lbs" },
          weight: 180,
        },
      },
      status: 200,
    });
  });

  it("answers { data: null } for a User without a Profile", async () => {
    expect(await getProfile(withoutProfile)).toEqual({
      body: { data: null },
      status: 200,
    });
  });

  it("never answers another User's Profile, whatever the request names", async () => {
    const response = await app.request(
      `/v1/profile?user_id=${withProfile}&userId=${withProfile}`,
      {
        headers: {
          ...signedInAs(withoutProfile),
          "x-user-id": withProfile,
        },
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: null });
  });
});
