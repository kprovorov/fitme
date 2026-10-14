import { describe, expect, it, vi } from "vitest";
import { call, connectWithServices } from "./harness.js";

const metricProfile = {
  age: 30,
  gender: "female",
  height: 170.5,
  measurement_system: "metric",
  units: { height: "cm", weight: "kg" },
  weight: 60.25,
};

describe("get_profile", () => {
  it("returns the Profile with its units", async () => {
    const client = await connectWithServices({
      getProfile: () => Promise.resolve(metricProfile),
    });

    const outcome = await call(client, "get_profile");

    expect(outcome.isError).toBe(false);
    expect(outcome.json).toEqual(metricProfile);
  });

  it("returns imperial units as the service reports them", async () => {
    const usProfile = {
      ...metricProfile,
      measurement_system: "us",
      units: { height: "in", weight: "lbs" },
    };
    const client = await connectWithServices({
      getProfile: () => Promise.resolve(usProfile),
    });

    expect((await call(client, "get_profile")).json).toEqual(usProfile);
  });

  it("reports a User without a Profile as a tool error", async () => {
    const client = await connectWithServices({
      getProfile: () => Promise.resolve(null),
    });

    const outcome = await call(client, "get_profile");

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      "No profile found: the user has not completed onboarding in the Fitme app yet."
    );
  });

  it("reports a database failure as a tool error without the SQL", async () => {
    const client = await connectWithServices({
      getProfile: () =>
        Promise.reject(
          new Error(
            'Failed query: select "age" from "profiles" where "user_id" = $1\nparams: user_1',
            {
              cause: Object.assign(new Error("canceling statement"), {
                code: "57014",
              }),
            }
          )
        ),
    });

    const outcome = await call(client, "get_profile");

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe("canceling statement");
  });

  it("reports an unexpected failure without its details", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const client = await connectWithServices({
      getProfile: () => Promise.reject(new Error("connect ECONNREFUSED")),
    });

    const outcome = await call(client, "get_profile");

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe("The database request failed.");
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});
