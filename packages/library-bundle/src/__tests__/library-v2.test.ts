import { describe, expect, it } from "vitest";

import fixture from "../../fixtures/library-v2.json" with { type: "json" };
import { createLibraryV2 } from "../library-v2";

const SUPABASE_URL = "https://project.supabase.co";

/** A loader answering `answers` in turn (the last one repeated), counting its calls. */
const loader = (...answers: unknown[]) => {
  const state = { calls: 0 };

  const load = () => {
    const answer = answers[Math.min(state.calls, answers.length - 1)];
    state.calls += 1;

    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer);
  };

  return { load, state };
};

/** The instance's Library over `load`, recording what it reports. */
const libraryOver = (load: () => Promise<unknown>, loadTimeoutMs?: number) => {
  const reported: Error[] = [];

  const library = createLibraryV2({
    load,
    loadTimeoutMs,
    reportError: (error) => {
      reported.push(error);
    },
    supabaseUrl: SUPABASE_URL,
  });

  return { library, reported };
};

describe("the instance's v2 Library", () => {
  it("loads once and keeps the Library, never reloading", async () => {
    const { load, state } = loader(fixture, { exercises: [], version: 2 });
    const { library, reported } = libraryOver(load);

    const first = await library.get();
    const second = await library.get();

    if (first.status !== "ready" || second.status !== "ready") {
      throw new Error("not ready");
    }

    expect(state.calls).toBe(1);
    expect(second.library).toBe(first.library);
    expect(reported).toHaveLength(0);
  });

  it("builds the Library from the bundle, old slugs and media URLs included", async () => {
    const { library } = libraryOver(loader(fixture).load);
    const answer = await library.get();

    if (answer.status !== "ready") {
      throw new Error("not ready");
    }

    expect(answer.library.get("example-press")?.slug).toBe(
      "example-bench-press"
    );
    expect(answer.library.get("example-bench-press")?.thumbnail_url).toMatch(
      /^https:\/\/project\.supabase\.co\/storage\/v1\/render\/image\/public\/library\//u
    );
  });

  it("shares one first load between concurrent asks", async () => {
    const { load, state } = loader(fixture);
    const { library } = libraryOver(load);

    const answers = await Promise.all([library.get(), library.get()]);

    expect(state.calls).toBe(1);
    expect(answers.map((answer) => answer.status)).toStrictEqual([
      "ready",
      "ready",
    ]);
  });

  it("answers unavailable after a failed first load, reporting it, then tries again", async () => {
    const outage = new Error("Blob is down");
    const { load, state } = loader(outage, fixture);
    const { library, reported } = libraryOver(load);

    await expect(library.get()).resolves.toStrictEqual({
      status: "unavailable",
    });
    expect(reported).toStrictEqual([outage]);

    await expect(library.get()).resolves.toMatchObject({ status: "ready" });
    expect(state.calls).toBe(2);
  });

  it("reports a bundle that fails the v2 schema, naming the field, and answers unavailable", async () => {
    const { library, reported } = libraryOver(
      loader({ exercises: [{ slug: "Not A Slug" }], version: 2 }).load
    );

    await expect(library.get()).resolves.toStrictEqual({
      status: "unavailable",
    });
    expect(reported[0]?.message).toMatch(
      /Invalid Library v2 bundle: .*exercises\.0/u
    );
  });

  it("reports a v1 bundle as invalid", async () => {
    const { library, reported } = libraryOver(
      loader({ exercises: [], version: 1 }).load
    );

    await expect(library.get()).resolves.toStrictEqual({
      status: "unavailable",
    });
    expect(reported[0]?.message).toMatch(/unsupported bundle version 1/u);
  });

  it("fails a load that takes too long, reporting it, and tries again next time", async () => {
    let calls = 0;

    const { library, reported } = libraryOver(() => {
      calls += 1;

      return calls === 1 ? new Promise(() => {}) : Promise.resolve(fixture);
    }, 20);

    await expect(library.get()).resolves.toStrictEqual({
      status: "unavailable",
    });
    expect(reported[0]?.message).toMatch(/timed out after 20 ms/u);

    await expect(library.get()).resolves.toMatchObject({ status: "ready" });
  });
});
