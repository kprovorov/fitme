import type * as Observability from "@fitme/observability/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as LibraryModule from "../agent/lib/library";
import { LIBRARY_OUTAGE, testLibrary } from "./library";
import { contextFor, inputSchemaOf, withClientContext } from "./tool-context";

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

const { default: getExerciseGuide } =
  await import("../agent/tools/get_exercise_guide");

const alice = contextFor("user_alice");

const guide = (exercise_slug: string, name: string) => ({
  common_mistakes: [`Rushing the ${name}.`],
  exercise_slug,
  name,
  short_description: `${name}, briefly.`,
  steps: [`Do the ${name}.`],
});

describe("get_exercise_guide", () => {
  beforeEach(() => {
    testLibrary.reset();
    observability.reportError.mockResolvedValue(undefined);
  });

  it("answers an Exercise's name, short description, steps and common mistakes in English", async () => {
    await expect(
      getExerciseGuide.execute({ exercise_slug: "bench-press" }, alice)
    ).resolves.toStrictEqual(guide("bench-press", "Bench Press"));
  });

  it("answers in the App language, and in English for an untranslated Exercise", async () => {
    const inUkrainian = withClientContext(alice, { language: "uk" });

    await expect(
      getExerciseGuide.execute({ exercise_slug: "bench-press" }, inUkrainian)
    ).resolves.toStrictEqual(guide("bench-press", "Жим лежачи"));
    await expect(
      getExerciseGuide.execute({ exercise_slug: "plank" }, inUkrainian)
    ).resolves.toStrictEqual(guide("plank", "Plank"));
  });

  it("answers an old slug with the Exercise replacing it", async () => {
    await expect(
      getExerciseGuide.execute({ exercise_slug: "barbell-bench-press" }, alice)
    ).resolves.toStrictEqual(guide("bench-press", "Bench Press"));
  });

  it("sends an unknown slug back to search_exercises", async () => {
    await expect(
      getExerciseGuide.execute({ exercise_slug: "jefferson-curl" }, alice)
    ).resolves.toStrictEqual({
      error:
        "Unknown exercise_slug: jefferson-curl. Use search_exercises to find a valid exercise_slug.",
    });
  });

  it("asks to retry when the library can't load, and reports it", async () => {
    testLibrary.reset({ loads: "fail" });

    await expect(
      getExerciseGuide.execute({ exercise_slug: "bench-press" }, alice)
    ).resolves.toStrictEqual({
      error:
        "The exercise library is unavailable right now, so the guide couldn't be read. Try again in a moment.",
    });
    expect(observability.reportError).toHaveBeenCalledWith(LIBRARY_OUTAGE, {
      exercise_library: "library",
    });
  });

  it("takes a trimmed slug within the Plan bound", () => {
    const schema = inputSchemaOf(getExerciseGuide);

    expect(schema.parse({ exercise_slug: " plank " })).toStrictEqual({
      exercise_slug: "plank",
    });
    expect(() => schema.parse({ exercise_slug: "" })).toThrow("Too small");
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(
      getExerciseGuide.execute({ exercise_slug: "plank" }, contextFor(null))
    ).rejects.toThrow("This Conversation has no signed-in owner");
  });
});
