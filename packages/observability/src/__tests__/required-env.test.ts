import { describe, expect, it, vi } from "vitest";
import { reportMissingEnv } from "../node";

const recorder = () =>
  vi.fn((_error: unknown, _tags?: Record<string, string>) => Promise.resolve());

const production = { VERCEL_ENV: "production" };

describe("reportMissingEnv", () => {
  it("reports each missing or empty variable once on production", async () => {
    const report = recorder();

    const missing = await reportMissingEnv(
      ["CLERK_JWT_KEY", "FITME_DATABASE_URL", "LIBRARY_URL"],
      {
        env: {
          ...production,
          FITME_DATABASE_URL: "",
          LIBRARY_URL: "https://x",
        },
        report,
      }
    );

    expect(missing).toEqual(["CLERK_JWT_KEY", "FITME_DATABASE_URL"]);
    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Missing CLERK_JWT_KEY environment variable",
        name: "MissingEnvError",
      }),
      { env_var: "CLERK_JWT_KEY" }
    );
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Missing FITME_DATABASE_URL environment variable",
      }),
      { env_var: "FITME_DATABASE_URL" }
    );
  });

  it("reports nothing when every variable is set", async () => {
    const report = recorder();

    const missing = await reportMissingEnv(["CLERK_JWT_KEY"], {
      env: { ...production, CLERK_JWT_KEY: "key" },
      report,
    });

    expect(missing).toEqual([]);
    expect(report).not.toHaveBeenCalled();
  });

  it.each([
    ["a preview", { VERCEL_ENV: "preview" }],
    ["local development", {}],
  ])("checks nothing on %s", async (_name, env) => {
    const report = recorder();

    const missing = await reportMissingEnv(["CLERK_JWT_KEY"], { env, report });

    expect(missing).toEqual([]);
    expect(report).not.toHaveBeenCalled();
  });

  it("accepts a pre-rename fallback in place of the variable", async () => {
    const report = recorder();

    const missing = await reportMissingEnv([["NEW_NAME", "OLD_NAME"]], {
      env: { ...production, NEW_NAME: "", OLD_NAME: "value" },
      report,
    });

    expect(missing).toEqual([]);
    expect(report).not.toHaveBeenCalled();
  });

  it("names the fallback when neither is set", async () => {
    const report = recorder();

    const missing = await reportMissingEnv([["NEW_NAME", "OLD_NAME"]], {
      env: production,
      report,
    });

    expect(missing).toEqual(["NEW_NAME"]);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Missing NEW_NAME (or OLD_NAME) environment variable",
      }),
      { env_var: "NEW_NAME" }
    );
  });
});
