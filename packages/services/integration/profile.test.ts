import { randomUUID } from "node:crypto";
import { asUser, profiles, withService } from "@fitme/db";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getProfile } from "../src/profile";

/**
 * getProfile through asUser, against a local Supabase stack via the Supavisor
 * pooler as the fitme login. Made-up Clerk-style User ids, unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const metric = `user_svcProfMetric${runId}`;
const imperial = `user_svcProfUs${runId}`;
const noProfile = `user_svcProfNone${runId}`;

beforeAll(async () => {
  await withService((tx) =>
    tx.insert(profiles).values([
      {
        age: 30,
        gender: "female",
        height: "170.5",
        measurementSystem: "metric",
        userId: metric,
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
    tx.delete(profiles).where(inArray(profiles.userId, [metric, imperial]))
  );
});

describe("getProfile", () => {
  it("returns the User's own Profile with metric units", async () => {
    expect(await asUser(metric, (tx) => getProfile(tx, metric))).toEqual({
      age: 30,
      gender: "female",
      height: 170.5,
      measurement_system: "metric",
      units: { height: "cm", weight: "kg" },
      weight: 60.25,
    });
  });

  it("returns imperial units for the us measurement system", async () => {
    expect(await asUser(imperial, (tx) => getProfile(tx, imperial))).toEqual({
      age: 41,
      gender: "male",
      height: 70,
      measurement_system: "us",
      units: { height: "in", weight: "lbs" },
      weight: 180,
    });
  });

  it("never shows another User's Profile", async () => {
    expect(await asUser(metric, (tx) => getProfile(tx, imperial))).toBeNull();
  });

  it("returns null when the User has no Profile yet", async () => {
    expect(
      await asUser(noProfile, (tx) => getProfile(tx, noProfile))
    ).toBeNull();
  });
});
