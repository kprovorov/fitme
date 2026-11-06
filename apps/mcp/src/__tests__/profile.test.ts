import { reportError as appReportError } from "@fitme/observability/node";
import { defaultStackParser, NodeClient, withScope } from "@sentry/node";
import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { call, connectWithServices, recordingReporter } from "./harness.js";

const metricProfile = {
  age: 30,
  gender: "female",
  height: 170.5,
  measurement_system: "metric",
  units: { height: "cm", weight: "kg" },
  weight: 60.25,
};

describe("get_profile", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("returns the Profile with its units", async () => {
    const client = await connectWithServices({
      getProfile: () => Promise.resolve(metricProfile),
    });

    const outcome = await call(client, "get_profile");

    expect(outcome.isError).toBeFalsy();
    expect(outcome.json).toStrictEqual(metricProfile);
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

    const outcome = await call(client, "get_profile");

    expect(outcome.json).toStrictEqual(usProfile);
  });

  it("answers a User without a Profile with a tool error, unreported", async () => {
    const { reportError, reported } = recordingReporter();

    const client = await connectWithServices(
      { getProfile: () => Promise.resolve(null) },
      reportError
    );

    const outcome = await call(client, "get_profile");

    expect(outcome.isError).toBeTruthy();
    expect(outcome.text).toBe(
      "No profile found: the user has not completed onboarding in the Fitme app yet."
    );
    expect(reported).toStrictEqual([]);
  });

  it("reports a database failure without its SQL, params or Postgres message", async () => {
    const log = vi.spyOn(console, "error").mockReturnValue(undefined);
    const reported: { error: unknown; tags: unknown }[] = [];

    const sentry = new NodeClient({
      beforeSend: (event, hint) => {
        reported.push({ error: hint.originalException, tags: event.tags });

        return null;
      },
      dsn: "https://public@sentry.test/1",
      integrations: [],
      stackParser: defaultStackParser,
      transport: () => ({
        flush: () => Promise.resolve(true),
        send: () => Promise.resolve({}),
      }),
    });

    onTestFinished(async () => {
      await sentry.close();
    });

    const failure = new DrizzleQueryError(
      'insert into "plans" ("description") values ($1)',
      ["my knee hurts"],
      Object.assign(
        new Error('invalid input syntax for type uuid: "my knee hurts"'),
        { code: "22P02" }
      )
    );

    // The app's own reporter, with a real Sentry client kept in memory.
    const client = await connectWithServices(
      { getProfile: () => Promise.reject(failure) },
      (error, tags) =>
        withScope(async (scope) => {
          scope.setClient(sentry);
          await appReportError(error, tags);
        })
    );

    const outcome = await call(client, "get_profile");

    expect(outcome).toMatchObject({
      isError: true,
      text: 'invalid input syntax for type uuid: "my knee hurts"',
    });
    expect(reported).toStrictEqual([
      { error: expect.any(Error), tags: { sqlstate: "22P02" } },
    ]);
    const sent = reported[0]?.error;

    if (!(sent instanceof Error)) {
      throw new TypeError("Expected Sentry to receive an Error");
    }

    const { cause, message, stack } = sent;
    expect({ cause, logged: log.mock.calls.flat(), message }).toStrictEqual({
      cause: undefined,
      logged: [sent],
      message: "Database query failed (SQLSTATE 22P02)",
    });

    expect(`${stack}\n${JSON.stringify(sent)}`).not.toMatch(
      /insert into|my knee hurts|params/u
    );

    // The frames still point at where the query failed
    expect(stack).toContain("profile.test.ts");
  });

  it("reports an unexpected failure and answers a tool error without its details", async () => {
    const { reportError, reported } = recordingReporter();
    const failure = new Error("connect ECONNREFUSED");

    const client = await connectWithServices(
      { getProfile: () => Promise.reject(failure) },
      reportError
    );

    const outcome = await call(client, "get_profile");

    expect(outcome.isError).toBeTruthy();
    expect(outcome.text).toBe("The database request failed.");
    expect(reported).toStrictEqual([failure]);
  });
});
