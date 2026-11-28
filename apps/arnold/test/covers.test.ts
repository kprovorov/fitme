import type * as Observability from "@fitme/observability/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { pickWorkoutCovers } from "../agent/lib/covers";
import type * as LibraryModule from "../agent/lib/library";
import type * as LibraryIndexModule from "../agent/lib/library-index";
import { LIBRARY_OUTAGE, testLibrary } from "./library";
import {
  BACK_COVER,
  CHEST_COVERS,
  INDEX_OUTAGE,
  LEGS_COVER,
  testCovers,
  testLibraryIndex,
} from "./library-index";

const observability = vi.hoisted(() => ({
  reportError: vi.fn<typeof Observability.reportError>(),
}));

vi.mock<typeof Observability>(
  import("@fitme/observability/node"),
  () => observability
);

vi.mock<typeof LibraryModule>(import("../agent/lib/library"), async () => {
  const { testLibrary: library } = await import("./library");

  return { getLibrary: () => library.get() };
});

vi.mock<typeof LibraryIndexModule>(
  import("../agent/lib/library-index"),
  async () => {
    const { testLibraryIndex: index } = await import("./library-index");

    return { getLibraryIndex: () => index.get() };
  }
);

const workout = (...slugs: string[]) => ({
  exercises: slugs.map((exercise_slug) => ({ exercise_slug })),
});

const RETRY_ERROR = {
  error:
    "The exercise library is unavailable right now, so nothing was saved. Try again in a moment.",
};

describe(pickWorkoutCovers, () => {
  beforeEach(() => {
    observability.reportError.mockReset();
    observability.reportError.mockResolvedValue(undefined);
    testLibrary.reset();
    testLibraryIndex.reset();
  });

  it("picks each new Workout a Cover for its most-trained muscle group", async () => {
    const answer = await pickWorkoutCovers({
      workouts: [
        workout("back-squat"),
        workout("pull-up"),
        workout("bench-press", "incline-dumbbell-press"),
      ],
    });

    expect(answer).toStrictEqual({
      covers: [LEGS_COVER, BACK_COVER, expect.any(String)],
    });
    expect(CHEST_COVERS).toContain(
      "covers" in answer ? answer.covers[2] : null
    );
  });

  it("names an old slug's muscle groups through the Exercise replacing it", async () => {
    const answer = await pickWorkoutCovers({
      workouts: [workout("barbell-bench-press")],
    });

    expect(CHEST_COVERS).toContain(
      "covers" in answer ? answer.covers[0] : null
    );
  });

  it("keeps the Covers distinct while there are enough", async () => {
    const answer = await pickWorkoutCovers({
      workouts: [workout("bench-press"), workout("incline-dumbbell-press")],
    });

    expect(new Set("covers" in answer ? answer.covers : [])).toStrictEqual(
      new Set(CHEST_COVERS)
    );
  });

  it("counts the Covers the Plan's kept Workouts hold as used", async () => {
    await expect(
      pickWorkoutCovers({
        usedCoverIds: [CHEST_COVERS[0]],
        workouts: [workout("bench-press")],
      })
    ).resolves.toStrictEqual({ covers: [CHEST_COVERS[1]] });
  });

  it("reuses the least-used Covers once every one is taken", async () => {
    await expect(
      pickWorkoutCovers({
        usedCoverIds: [
          ...testCovers.map((cover) => cover.id),
          CHEST_COVERS[0],
          LEGS_COVER,
          BACK_COVER,
        ],
        workouts: [workout("back-squat")],
      })
    ).resolves.toStrictEqual({ covers: [CHEST_COVERS[1]] });
  });

  it("falls back to any Cover for a muscle group no Cover is tagged with", async () => {
    const answer = await pickWorkoutCovers({ workouts: [workout("plank")] });

    expect(testCovers.map((cover) => cover.id)).toContain(
      "covers" in answer ? answer.covers[0] : null
    );
  });

  it("gives no Cover from an index without Covers", async () => {
    testLibraryIndex.reset({ covers: [] });

    await expect(
      pickWorkoutCovers({
        workouts: [workout("bench-press"), workout("back-squat")],
      })
    ).resolves.toStrictEqual({ covers: [null, null] });
  });

  it("asks nothing of either Library with no Workout to cover", async () => {
    testLibraryIndex.reset({ loads: "fail" });

    await expect(pickWorkoutCovers({ workouts: [] })).resolves.toStrictEqual({
      covers: [],
    });
    expect(testLibraryIndex.loads()).toBe(0);
  });

  it("answers the retry error, reported, when the index can't load, and loads again on the next ask", async () => {
    testLibraryIndex.reset({ loads: "fail" });

    await expect(
      pickWorkoutCovers({ workouts: [workout("bench-press")] })
    ).resolves.toStrictEqual(RETRY_ERROR);
    expect(observability.reportError).toHaveBeenCalledWith(INDEX_OUTAGE, {
      exercise_library: "index",
    });

    await expect(
      pickWorkoutCovers({ workouts: [workout("bench-press")] })
    ).resolves.toStrictEqual(RETRY_ERROR);
    expect(testLibraryIndex.loads()).toBe(2);
  });

  it("answers the retry error, reported, when the new Library can't load", async () => {
    testLibrary.reset({ loads: "fail" });

    await expect(
      pickWorkoutCovers({ workouts: [workout("bench-press")] })
    ).resolves.toStrictEqual(RETRY_ERROR);
    expect(observability.reportError).toHaveBeenCalledWith(LIBRARY_OUTAGE, {
      exercise_library: "library",
    });
  });
});
