import { describe, expect, it } from "vitest";

import { createLibraryIndex, RELOAD_INTERVAL_MS } from "../library-index";

const bundle = (
  exercises: { muscle_groups: string[]; slug: string }[],
  covers: { id: string; muscle_groups: string[] }[] = []
) => ({ covers, exercises, version: 1 });

const SQUAT = { muscle_groups: ["quadriceps", "glutes"], slug: "squat" };
const BENCH = { muscle_groups: ["chest"], slug: "bench-press" };

/** A loader answering `bundles` in turn (the last one repeated), counting its calls. */
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

/** An index over `load` on a fake clock, recording what it reports. */
const indexOver = (load: () => Promise<unknown>) => {
  const clock = { now: 0 };
  const reported: Error[] = [];

  const index = createLibraryIndex({
    load,
    now: () => clock.now,
    reportError: (error) => {
      reported.push(error);
    },
  });

  return { clock, index, reported };
};

describe("the Library index", () => {
  it("loads once for repeated checks", async () => {
    const { load, state } = loader(bundle([SQUAT]));
    const { index } = indexOver(load);

    await index.lookup(["squat"]);
    await index.lookup(["squat"]);
    await index.lookup([]);

    expect(state.calls).toBe(1);
  });

  it("answers known slugs with their muscle groups, in asked order, each once", async () => {
    const { index } = indexOver(loader(bundle([SQUAT, BENCH])).load);

    await expect(
      index.lookup(["bench-press", "squat", "bench-press"])
    ).resolves.toStrictEqual({
      covers: [],
      exercises: [
        { muscle_groups: ["chest"], slug: "bench-press" },
        { muscle_groups: ["quadriceps", "glutes"], slug: "squat" },
      ],
      missing: [],
      status: "ready",
    });
  });

  it("reloads on a miss, after which a newly added slug is known", async () => {
    const { load, state } = loader(bundle([SQUAT]), bundle([SQUAT, BENCH]));
    const { clock, index } = indexOver(load);

    await index.lookup(["squat"]);
    clock.now = RELOAD_INTERVAL_MS;

    const answer = await index.lookup(["squat", "bench-press"]);

    expect(state.calls).toBe(2);
    expect(answer).toMatchObject({
      exercises: [{ slug: "squat" }, { slug: "bench-press" }],
      missing: [],
    });
  });

  it("answers a slug still missing after the reload as missing", async () => {
    const { load, state } = loader(bundle([SQUAT]));
    const { clock, index } = indexOver(load);

    await index.lookup(["squat"]);
    clock.now = RELOAD_INTERVAL_MS;

    await expect(index.lookup(["squat", "made-up"])).resolves.toMatchObject({
      exercises: [{ slug: "squat" }],
      missing: ["made-up"],
      status: "ready",
    });
    expect(state.calls).toBe(2);
  });

  it("doesn't reload within 60 s of the last load, the first one included", async () => {
    const { load, state } = loader(bundle([SQUAT]));
    const { clock, index } = indexOver(load);

    await index.lookup(["made-up"]);
    clock.now = RELOAD_INTERVAL_MS - 1;

    await expect(index.lookup(["made-up"])).resolves.toMatchObject({
      missing: ["made-up"],
    });
    expect(state.calls).toBe(1);
  });

  it("reloads again once 60 s have passed since the last reload", async () => {
    const { load, state } = loader(bundle([SQUAT]));
    const { clock, index } = indexOver(load);

    await index.lookup(["made-up"]);
    clock.now = RELOAD_INTERVAL_MS;
    await index.lookup(["made-up"]);
    clock.now = RELOAD_INTERVAL_MS * 2 - 1;
    await index.lookup(["made-up"]);

    expect(state.calls).toBe(2);

    clock.now = RELOAD_INTERVAL_MS * 2;
    await index.lookup(["made-up"]);

    expect(state.calls).toBe(3);
  });

  it("shares one reload between concurrent misses", async () => {
    let release = () => {};
    const state = { calls: 0 };

    const { clock, index } = indexOver(() => {
      state.calls += 1;

      if (state.calls === 1) {
        return Promise.resolve(bundle([SQUAT]));
      }

      return new Promise((resolve) => {
        release = () => resolve(bundle([SQUAT, BENCH]));
      });
    });

    await index.lookup(["squat"]);
    clock.now = RELOAD_INTERVAL_MS;

    const first = index.lookup(["bench-press"]);
    const second = index.lookup(["bench-press"]);
    // A known slug asked meanwhile waits for the reload too.
    const third = index.lookup(["squat"]);
    await Promise.resolve();
    release();

    const answers = await Promise.all([first, second, third]);

    expect(state.calls).toBe(2);
    expect(answers.map((answer) => answer.status)).toStrictEqual([
      "ready",
      "ready",
      "ready",
    ]);
    expect(answers[0]).toMatchObject({ missing: [] });
    expect(answers[1]).toMatchObject({ missing: [] });
  });

  it("shares one first load between concurrent checks", async () => {
    const { load, state } = loader(bundle([SQUAT]));
    const { index } = indexOver(load);

    await Promise.all([index.lookup(["squat"]), index.lookup(["squat"])]);

    expect(state.calls).toBe(1);
  });

  it("keeps the index when a reload fails, and reports the failure", async () => {
    const outage = new Error("Blob is down");
    const { load } = loader(bundle([SQUAT]), outage);
    const { clock, index, reported } = indexOver(load);

    await index.lookup(["squat"]);
    clock.now = RELOAD_INTERVAL_MS;

    await expect(index.lookup(["squat", "bench-press"])).resolves.toMatchObject(
      {
        exercises: [{ slug: "squat" }],
        missing: ["bench-press"],
        status: "ready",
      }
    );
    expect(reported).toStrictEqual([outage]);
    await expect(index.lookup(["squat"])).resolves.toMatchObject({
      missing: [],
    });
  });

  it("answers unavailable when the first load fails, and loads again on the next check", async () => {
    const outage = new Error("Blob is down");
    const { load, state } = loader(outage, bundle([SQUAT]));
    const { index, reported } = indexOver(load);

    await expect(index.lookup(["squat"])).resolves.toStrictEqual({
      status: "unavailable",
    });
    expect(reported).toStrictEqual([outage]);

    // No throttle without an index: the very next check tries again.
    await expect(index.lookup(["squat"])).resolves.toMatchObject({
      exercises: [{ slug: "squat" }],
      status: "ready",
    });
    expect(state.calls).toBe(2);
  });

  it("ignores fields it doesn't read and keeps muscle groups it doesn't know", async () => {
    const { index } = indexOver(
      loader({
        covers: [
          {
            future: true,
            id: "c1",
            image: { extension: "avif" },
            muscle_groups: ["forearms-next-year"],
          },
        ],
        exercises: [
          {
            equipment: ["a-new-machine"],
            locales: { de: { name: "Kniebeuge" } },
            muscle_groups: ["forearms-next-year"],
            slug: "squat",
            somethingNew: 1,
          },
        ],
        published_at: "2026-11-14",
        version: 1,
      }).load
    );

    await expect(index.lookup(["squat"])).resolves.toStrictEqual({
      covers: [{ id: "c1", muscle_groups: ["forearms-next-year"] }],
      exercises: [{ muscle_groups: ["forearms-next-year"], slug: "squat" }],
      missing: [],
      status: "ready",
    });
  });

  it.each([
    ["not an object", "not a bundle"],
    ["a wrong version", { exercises: [], version: 2 }],
    ["no exercises", { version: 1 }],
    [
      "a slug that isn't a string",
      { exercises: [{ muscle_groups: [], slug: 1 }], version: 1 },
    ],
  ])("fails the load on an unreadable bundle (%s)", async (_, json) => {
    const { index, reported } = indexOver(loader(json).load);

    await expect(index.lookup(["squat"])).resolves.toStrictEqual({
      status: "unavailable",
    });
    expect(reported).toHaveLength(1);
    expect(reported[0].message).toMatch(/Unreadable library\.json/u);
  });

  it("answers Covers in bundle order", async () => {
    const covers = [
      { id: "c3", muscle_groups: ["back"] },
      { id: "c1", muscle_groups: ["chest"] },
      { id: "c2", muscle_groups: ["chest", "triceps"] },
    ];

    const { index } = indexOver(loader(bundle([SQUAT], covers)).load);

    await expect(index.lookup([])).resolves.toMatchObject({ covers });
  });

  it("answers no Covers for a bundle without them", async () => {
    const { index } = indexOver(
      loader({ exercises: [SQUAT], version: 1 }).load
    );

    await expect(index.lookup(["squat"])).resolves.toMatchObject({
      covers: [],
    });
  });
});
