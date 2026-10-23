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

/** `PATCH /v1/profile` as `userId` with a JSON body. */
const patchProfile = (
  app: ReturnType<typeof testApp>["app"],
  body: unknown,
  userId = "user_alice"
) =>
  app.request("/v1/profile", {
    body: JSON.stringify(body),
    headers: { ...signedInAs(userId), "content-type": "application/json" },
    method: "PATCH",
  });

describe("PATCH /v1/profile", () => {
  it("changes only the given field and answers the updated Profile", async () => {
    const changes: unknown[] = [];
    const { app, reported, servicesFor } = testApp({
      services: fakeServices({
        updateProfile: (given) => {
          changes.push(given);
          return Promise.resolve({ ...profile, age: 31 });
        },
      }),
    });

    const response = await patchProfile(app, { age: 31 });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { ...profile, age: 31 } });
    expect(changes).toEqual([{ age: 31 }]);
    expect(servicesFor).toEqual(["user_alice"]);
    expect(reported).toEqual([]);
  });

  it("answers a new measurement system with the converted values and its units", async () => {
    const changes: unknown[] = [];
    const converted = {
      ...profile,
      height: 67.13,
      measurement_system: "us",
      units: { height: "in", weight: "lbs" },
      weight: 132.83,
    };
    const { app } = testApp({
      services: fakeServices({
        updateProfile: (given) => {
          changes.push(given);
          return Promise.resolve(converted);
        },
      }),
    });

    const response = await patchProfile(app, { measurement_system: "us" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: converted });
    expect(changes).toEqual([{ measurement_system: "us" }]);
  });

  it("passes every field it accepts", async () => {
    const changes: unknown[] = [];
    const { app } = testApp({
      services: fakeServices({
        updateProfile: (given) => {
          changes.push(given);
          return Promise.resolve(profile);
        },
      }),
    });
    const every = {
      age: 30,
      gender: "female",
      height: 170.5,
      measurement_system: "metric",
      weight: 60.25,
    };

    const response = await patchProfile(app, every);

    expect(response.status).toBe(200);
    expect(changes).toEqual([every]);
  });

  it("answers 404 profile_not_found without a Profile, unreported", async () => {
    const { app, reported } = testApp({
      services: fakeServices({ updateProfile: () => Promise.resolve(null) }),
    });

    const response = await patchProfile(app, { age: 31 });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "profile_not_found", message: expect.any(String) },
    });
    expect(reported).toEqual([]);
  });

  it("never shows fields beyond the contract", async () => {
    const { app } = testApp({
      services: fakeServices({
        updateProfile: () =>
          Promise.resolve({ ...profile, user_id: "user_alice" }),
      }),
    });

    const response = await patchProfile(app, { age: 30 });

    expect(await response.json()).toEqual({ data: profile });
  });

  it.each([
    ["an unknown gender", { gender: "other" }],
    ["an unknown measurement system", { measurement_system: "imperial" }],
    ["a fractional age", { age: 30.5 }],
    ["an age under 10", { age: 9 }],
    ["an age over 120", { age: 121 }],
    ["a zero height", { height: 0 }],
    ["a negative weight", { weight: -1 }],
    ["a height over the maximum", { height: 301 }],
    ["a weight over the maximum", { weight: 1001 }],
    ["more than 2 decimals", { weight: 60.255 }],
    ["a string number", { age: "30" }],
    ["a null field", { weight: null }],
    ["an empty body", {}],
    ["an unknown field", { age: 30, user_id: "user_bob" }],
    ["an array", [{ age: 30 }]],
  ])("answers 400 invalid_request for %s, writing nothing", async (_, body) => {
    const { app, reported } = testApp({
      services: fakeServices({}),
    });

    const response = await patchProfile(app, body);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "invalid_request", message: expect.any(String) },
    });
    expect(reported).toEqual([]);
  });

  it("answers 415 for a body that isn't JSON, unreported", async () => {
    const { app, reported } = testApp({ services: fakeServices({}) });

    const response = await app.request("/v1/profile", {
      body: "age=30",
      headers: {
        ...signedInAs("user_alice"),
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "PATCH",
    });

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      error: { code: "http_error", message: "Unsupported Media Type" },
    });
    expect(reported).toEqual([]);
  });

  it("answers 400 invalid_request without a body, unreported", async () => {
    const { app, reported } = testApp({ services: fakeServices({}) });

    const response = await app.request("/v1/profile", {
      headers: signedInAs("user_alice"),
      method: "PATCH",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "invalid_request", message: expect.any(String) },
    });
    expect(reported).toEqual([]);
  });

  it("answers 401 without a token", async () => {
    const { app } = testApp({ services: fakeServices({}) });

    const response = await app.request("/v1/profile", {
      body: JSON.stringify({ age: 30 }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });

    expect(response.status).toBe(401);
  });
});
