import { reportError as appReportError } from "@fitme/observability/node";
import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { call, connectWithServices, recordingReporter } from "./harness.js";

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
}));
vi.mock("@sentry/node", () => sentry);

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

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

  it("answers a User without a Profile with a tool error, unreported", async () => {
    const { reportError, reported } = recordingReporter();
    const client = await connectWithServices(
      { getProfile: () => Promise.resolve(null) },
      reportError
    );

    const outcome = await call(client, "get_profile");

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      "No profile found: the user has not completed onboarding in the Fitme app yet."
    );
    expect(reported).toEqual([]);
  });

  it("reports a database failure without its SQL, params or Postgres message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new DrizzleQueryError(
      'insert into "plans" ("description") values ($1)',
      ["my knee hurts"],
      Object.assign(
        new Error('invalid input syntax for type uuid: "my knee hurts"'),
        { code: "22P02" }
      )
    );
    // The app's own reporter (@fitme/observability/node), Sentry faked
    const client = await connectWithServices(
      { getProfile: () => Promise.reject(failure) },
      appReportError
    );

    const outcome = await call(client, "get_profile");

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe(
      'invalid input syntax for type uuid: "my knee hurts"'
    );
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    const [sent, hint] = sentry.captureException.mock.calls[0] ?? [];
    expect(sent).toBeInstanceOf(Error);
    const { cause, message, stack } = sent as Error;
    expect(message).toBe("Database query failed (SQLSTATE 22P02)");
    expect(cause).toBeUndefined();
    expect(log.mock.calls.flat()).toEqual([sent]);
    for (const leak of ["insert into", "my knee hurts", "params"]) {
      expect(stack).not.toContain(leak);
      expect(JSON.stringify(sent)).not.toContain(leak);
    }
    // The frames still point at where the query failed
    expect(stack).toContain("profile.test.ts");
    expect(hint).toEqual({ tags: { sqlstate: "22P02" } });
  });

  it("reports an unexpected failure and answers a tool error without its details", async () => {
    const { reportError, reported } = recordingReporter();
    const failure = new Error("connect ECONNREFUSED");
    const client = await connectWithServices(
      { getProfile: () => Promise.reject(failure) },
      reportError
    );

    const outcome = await call(client, "get_profile");

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe("The database request failed.");
    expect(reported).toEqual([failure]);
  });
});
