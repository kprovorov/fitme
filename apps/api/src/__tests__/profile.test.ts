import { describe, expect, it } from "vitest";
import { fakeServices, signedInAs, testApp } from "../test/harness.js";

const profile = {
  age: 30,
  gender: "female",
  height: 170.5,
  measurement_system: "metric",
  units: { height: "cm", weight: "kg" },
  weight: 60.25,
};

describe("GET /v1/profile", () => {
  it("answers the signed-in User's Profile with its units", async () => {
    const { app, servicesFor } = testApp({
      services: fakeServices({ getProfile: () => Promise.resolve(profile) }),
    });

    const response = await app.request("/v1/profile", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: profile });
    expect(servicesFor).toEqual(["user_alice"]);
  });

  it("answers { data: null } before onboarding", async () => {
    const { app, reported } = testApp({
      services: fakeServices({ getProfile: () => Promise.resolve(null) }),
    });

    const response = await app.request("/v1/profile", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: null });
    expect(reported).toEqual([]);
  });

  it("never shows fields beyond the contract", async () => {
    const { app } = testApp({
      services: fakeServices({
        getProfile: () =>
          Promise.resolve({
            ...profile,
            units: { ...profile.units, volume: "l" },
            user_id: "user_alice",
          }),
      }),
    });

    const response = await app.request("/v1/profile", {
      headers: signedInAs("user_alice"),
    });

    expect(await response.json()).toEqual({ data: profile });
  });
});
