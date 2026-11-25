import { describe, expect, it, vi } from "vitest";

import { forgottenWorkoutSessions } from "../jobs/forgotten-workout-sessions";

describe("the forgotten-workout-sessions job", () => {
  it("reaches Postgres, then logs that it ran", async () => {
    const calls: string[] = [];

    await forgottenWorkoutSessions({
      log: (message) => {
        calls.push(message);
      },
      pingDatabase: () => {
        calls.push("ping");

        return Promise.resolve();
      },
    })();

    expect(calls).toStrictEqual(["ping", "forgotten-workout-sessions ran"]);
  });

  it("fails without saying it ran when Postgres can't be reached", async () => {
    const log = vi.fn<(message: string) => void>();

    const run = forgottenWorkoutSessions({
      log,
      pingDatabase: () => Promise.reject(new Error("no database")),
    });

    await expect(run()).rejects.toThrow("no database");
    expect(log).not.toHaveBeenCalled();
  });

  it("fails without FITME_DATABASE_URL", async () => {
    vi.stubEnv("FITME_DATABASE_URL", "");

    await expect(forgottenWorkoutSessions()()).rejects.toThrow(
      "FITME_DATABASE_URL is not set"
    );

    vi.unstubAllEnvs();
  });
});
