import type * as Db from "@fitme/db";
import { LibraryUnavailableError } from "@fitme/library-sdk";
import type * as Observability from "@fitme/observability/node";
import type * as EditServices from "@fitme/services/workout-edits";
import type { ToolContext } from "eve/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type * as LibraryModule from "../agent/lib/library";
import { fakeLibrary } from "./library";
import { contextFor, inputSchemaOf, userIdFields } from "./tool-context";
import type { TestedTool } from "./tool-context";

type EditService<Service> = Service extends (
  transaction: never,
  ...args: infer Args
) => infer Result
  ? (transaction: typeof tx, ...args: Args) => Result
  : never;

type EditResult = Awaited<ReturnType<(typeof edits)[keyof typeof edits]>>;

const db = vi.hoisted(() => ({
  asUser:
    vi.fn<
      (
        userId: string,
        edit: (transaction: typeof tx) => Promise<EditResult>
      ) => Promise<EditResult>
    >(),
}));

const editErrors = vi.hoisted(() => ({
  MAX_SETS_PER_EXERCISE: 20,
  TooManySetsError: class FakeTooManySetsError extends Error {
    constructor(maxSets: number) {
      super(`An exercise can have at most ${maxSets} sets`);
      this.name = "FakeTooManySetsError";
    }
  },
}));

const edits = vi.hoisted(() => ({
  addExerciseToWorkout:
    vi.fn<EditService<typeof EditServices.addExerciseToWorkout>>(),
  addSetToExercise: vi.fn<EditService<typeof EditServices.addSetToExercise>>(),
  removeExerciseFromWorkout:
    vi.fn<EditService<typeof EditServices.removeExerciseFromWorkout>>(),
  removeSetFromExercise:
    vi.fn<EditService<typeof EditServices.removeSetFromExercise>>(),
  replaceExerciseInWorkout:
    vi.fn<EditService<typeof EditServices.replaceExerciseInWorkout>>(),
  updateSetRecommendations:
    vi.fn<EditService<typeof EditServices.updateSetRecommendations>>(),
}));

vi.mock<typeof Db | typeof db>(import("@fitme/db"), () => db);

vi.mock<typeof EditServices | typeof edits | typeof editErrors>(
  import("@fitme/services/workout-edits"),
  () => ({
    ...edits,
    ...editErrors,
  })
);

const observability = vi.hoisted(() => ({
  reportError: vi.fn<typeof Observability.reportError>(),
}));

vi.mock<typeof Observability>(
  import("@fitme/observability/node"),
  () => observability
);

vi.mock<typeof LibraryModule>(import("../agent/lib/library"), async () => {
  const { fakeLibrary: library } = await import("./library");

  return { getLibrary: () => library };
});

const { default: addExerciseToWorkout } =
  await import("../agent/tools/add_exercise_to_workout");

const { default: addSetToExercise } =
  await import("../agent/tools/add_set_to_exercise");

const { default: removeExerciseFromWorkout } =
  await import("../agent/tools/remove_exercise_from_workout");

const { default: removeSetFromExercise } =
  await import("../agent/tools/remove_set_from_exercise");

const { default: replaceExerciseInWorkout } =
  await import("../agent/tools/replace_exercise_in_workout");

const { default: updateSetRecommendations } =
  await import("../agent/tools/update_set_recommendations");

const tx = { fake: "transaction" };
const workoutId = "a0000000-0000-4000-8000-000000000001";
const workoutExerciseId = "b0000000-0000-4000-8000-000000000001";
const exerciseSlug = "bench-press";
const legacyExerciseId = "c0000000-0000-4000-8000-000000000001";
const setId = "d0000000-0000-4000-8000-000000000001";

const sets = [
  { reps_recommended: 8, rest_recommended: 90, weight_recommended: 60 },
];

const [newSet] = sets;

type ToolResult = Awaited<
  ReturnType<
    | typeof addExerciseToWorkout.execute
    | typeof addSetToExercise.execute
    | typeof removeExerciseFromWorkout.execute
    | typeof removeSetFromExercise.execute
    | typeof replaceExerciseInWorkout.execute
    | typeof updateSetRecommendations.execute
  >
>;

type Tool = TestedTool<never, Promise<ToolResult>>;

type ModelInput = Record<string, string | number | typeof sets | undefined>;

/** What eve hands `execute` after validating the model's input. */
const parseInput = <Input>(tool: TestedTool<Input>, input: ModelInput) =>
  inputSchemaOf(tool).parse(input);

const run = async (
  tool: Tool,
  input: ModelInput,
  ctx = contextFor("user_alice")
) => await tool.execute(parseInput(tool, input), ctx);

const accepts = (tool: Tool, input: ModelInput) =>
  inputSchemaOf(tool).safeParse(input).success;

const serviceCalls = () =>
  JSON.stringify([
    db.asUser.mock.calls,
    ...Object.values(edits).map((service) => service.mock.calls),
  ]);

const cases: {
  input: ModelInput;
  name: string;
  service: keyof typeof edits;
  tool: Tool;
}[] = [
  {
    input: { exercise_slug: exerciseSlug, sets, workout_id: workoutId },
    name: "add_exercise_to_workout",
    service: "addExerciseToWorkout",
    tool: addExerciseToWorkout,
  },
  {
    input: { ...newSet, workout_exercise_id: workoutExerciseId },
    name: "add_set_to_exercise",
    service: "addSetToExercise",
    tool: addSetToExercise,
  },
  {
    input: { workout_exercise_id: workoutExerciseId },
    name: "remove_exercise_from_workout",
    service: "removeExerciseFromWorkout",
    tool: removeExerciseFromWorkout,
  },
  {
    input: { set_id: setId },
    name: "remove_set_from_exercise",
    service: "removeSetFromExercise",
    tool: removeSetFromExercise,
  },
  {
    input: {
      new_exercise_slug: exerciseSlug,
      sets,
      workout_exercise_id: workoutExerciseId,
    },
    name: "replace_exercise_in_workout",
    service: "replaceExerciseInWorkout",
    tool: replaceExerciseInWorkout,
  },
  {
    input: { reps_recommended: 10, set_id: setId },
    name: "update_set_recommendations",
    service: "updateSetRecommendations",
    tool: updateSetRecommendations,
  },
];

const resetEdits = () => {
  fakeLibrary.failWith(null);
  observability.reportError.mockResolvedValue(undefined);
  db.asUser.mockImplementation(async (_userId, fn) => await fn(tx));
  edits.addExerciseToWorkout.mockResolvedValue({
    id: workoutExerciseId,
    order: 3,
    setsAdded: 1,
  });
  edits.addSetToExercise.mockResolvedValue({ id: setId, order: 3 });
  edits.removeExerciseFromWorkout.mockResolvedValue(true);
  edits.removeSetFromExercise.mockResolvedValue(true);
  edits.replaceExerciseInWorkout.mockResolvedValue(true);
  edits.updateSetRecommendations.mockResolvedValue({
    id: setId,
    order: 1,
    reps_recommended: 10,
    rest_recommended: 90,
    weight_recommended: 60,
  });
};

describe.each(cases)("$name", ({ input, service, tool }) => {
  beforeEach(resetEdits);

  it("edits as the session's User, in one asUser transaction", async () => {
    await run(tool, input);

    expect(db.asUser).toHaveBeenCalledExactlyOnceWith(
      "user_alice",
      expect.any(Function)
    );
    expect(edits[service].mock.calls[0].slice(0, 2)).toStrictEqual([
      tx,
      "user_alice",
    ]);
  });

  it("ignores any User id in its input", async () => {
    const parsed = parseInput(tool, { ...input, ...userIdFields });

    await tool.execute(parsed, contextFor("user_alice"));

    expect(parsed).toStrictEqual(input);
    expect(serviceCalls()).not.toContain("user_mallory");
  });

  it("acts as the session's owner, never the turn's caller", async () => {
    await run(tool, input, contextFor("user_alice", "user_mallory"));

    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(serviceCalls()).not.toContain("user_mallory");
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(run(tool, input, contextFor(null))).rejects.toThrow(
      "This Conversation has no signed-in owner"
    );
    expect(db.asUser).not.toHaveBeenCalled();
  });

  it("rejects ids that aren't uuids", () => {
    const withBadIds = Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        key.endsWith("_id") ? "latest" : value,
      ])
    );

    expect(inputSchemaOf(tool).safeParse(withBadIds).success).toBeFalsy();
  });
});

/** The checks every tool writing an Exercise slug runs before asUser. */
const slugChecks = [
  {
    field: "exercise_slug",
    input: { exercise_slug: exerciseSlug, sets, workout_id: workoutId },
    service: "addExerciseToWorkout",
    tool: addExerciseToWorkout,
  },
  {
    field: "new_exercise_slug",
    input: {
      new_exercise_slug: exerciseSlug,
      sets,
      workout_exercise_id: workoutExerciseId,
    },
    service: "replaceExerciseInWorkout",
    tool: replaceExerciseInWorkout,
  },
] as const;

describe.each(slugChecks)(
  "$field checks",
  ({ field, input, service, tool }) => {
    beforeEach(resetEdits);

    it("refuses a slug the library doesn't know, writing nothing", async () => {
      await expect(
        run(tool, { ...input, [field]: "made-up-fly" })
      ).resolves.toStrictEqual({
        error:
          "Unknown exercise_slug(s): made-up-fly. Use search_exercises to find a valid exercise_slug; nothing was saved.",
      });
      expect(db.asUser).not.toHaveBeenCalled();
      expect(edits[service]).not.toHaveBeenCalled();
    });

    it("sends an old exercise id back to search_exercises by name", async () => {
      const answer = z.object({ error: z.string() }).parse(
        await run(tool, {
          ...input,
          [field]: legacyExerciseId,
        })
      );

      expect(answer.error).toContain("search_exercises");
      expect(answer.error).toContain("name");
      expect(db.asUser).not.toHaveBeenCalled();
    });

    it("asks to retry when the library fails, writing nothing", async () => {
      const failure = new LibraryUnavailableError();
      fakeLibrary.failWith(failure);

      await expect(run(tool, input)).resolves.toStrictEqual({
        error:
          "The exercise library is unavailable right now, so nothing was saved. Try again in a moment.",
      });
      expect(db.asUser).not.toHaveBeenCalled();
      expect(observability.reportError).toHaveBeenCalledWith(
        failure,
        expect.anything()
      );
    });
  }
);

describe("add_exercise_to_workout", () => {
  beforeEach(resetEdits);

  const input = { exercise_slug: exerciseSlug, sets, workout_id: workoutId };

  it("adds the Exercise and reports it", async () => {
    await expect(run(addExerciseToWorkout, input)).resolves.toStrictEqual({
      sets_added: 1,
      success: true,
      workout_exercise_id: workoutExerciseId,
    });
    const [call] = edits.addExerciseToWorkout.mock.calls;
    expect(call[2].requestKey).toBeTypeOf("string");
    expect(edits.addExerciseToWorkout).toHaveBeenCalledWith(tx, "user_alice", {
      exerciseSlug,
      requestKey: call[2].requestKey,
      sets,
      workoutId,
    });
  });

  it("tells the model when the User has no such Workout", async () => {
    edits.addExerciseToWorkout.mockResolvedValue(null);

    await expect(run(addExerciseToWorkout, input)).resolves.toStrictEqual({
      error: "Workout not found",
    });
  });

  it("needs at least one set", () => {
    expect(
      inputSchemaOf(addExerciseToWorkout).safeParse({
        ...input,
        sets: [],
      }).success
    ).toBeFalsy();
  });
});

describe("add_set_to_exercise", () => {
  beforeEach(resetEdits);

  const input = { ...newSet, workout_exercise_id: workoutExerciseId };

  it("appends the set and reports it", async () => {
    await expect(run(addSetToExercise, input)).resolves.toStrictEqual({
      order: 3,
      set_id: setId,
      success: true,
    });
    const [call] = edits.addSetToExercise.mock.calls;
    expect(call[2].requestKey).toBeTypeOf("string");
    expect(edits.addSetToExercise).toHaveBeenCalledWith(tx, "user_alice", {
      requestKey: call[2].requestKey,
      set: newSet,
      workoutExerciseId,
    });
  });

  it("tells the model when the Exercise already has the most sets allowed", async () => {
    edits.addSetToExercise.mockRejectedValue(
      new editErrors.TooManySetsError(20)
    );

    await expect(run(addSetToExercise, input)).resolves.toStrictEqual({
      error: "An exercise can have at most 20 sets",
    });
  });

  it("tells the model when the User has no such Workout Exercise", async () => {
    edits.addSetToExercise.mockResolvedValue(null);

    await expect(run(addSetToExercise, input)).resolves.toStrictEqual({
      error: "Workout exercise not found",
    });
  });
});

describe("set targets", () => {
  beforeEach(resetEdits);

  const tooMuch = [
    { reps_recommended: 1001 },
    { rest_recommended: 3601 },
    { weight_recommended: 10_001 },
  ];

  it.each(tooMuch)("rejects %o past the domain limits", (change) => {
    expect(
      accepts(addSetToExercise, {
        ...newSet,
        ...change,
        workout_exercise_id: workoutExerciseId,
      })
    ).toBeFalsy();
    expect(
      accepts(updateSetRecommendations, { ...change, set_id: setId })
    ).toBeFalsy();
    expect(
      accepts(addExerciseToWorkout, {
        exercise_slug: exerciseSlug,
        sets: [{ ...newSet, ...change }],
        workout_id: workoutId,
      })
    ).toBeFalsy();
    expect(
      accepts(replaceExerciseInWorkout, {
        new_exercise_slug: exerciseSlug,
        sets: [{ ...newSet, ...change }],
        workout_exercise_id: workoutExerciseId,
      })
    ).toBeFalsy();
  });

  it("rejects more than 20 sets for one Exercise", () => {
    expect(
      accepts(addExerciseToWorkout, {
        exercise_slug: exerciseSlug,
        sets: Array.from({ length: 21 }, () => newSet),
        workout_id: workoutId,
      })
    ).toBeFalsy();
  });

  it("accepts targets at the limits", () => {
    expect(
      accepts(addSetToExercise, {
        reps_recommended: 1000,
        rest_recommended: 3600,
        weight_recommended: 10_000,
        workout_exercise_id: workoutExerciseId,
      })
    ).toBeTruthy();
  });
});

describe("request keys", () => {
  beforeEach(resetEdits);

  const input = { ...newSet, workout_exercise_id: workoutExerciseId };

  const keyOf = async (ctx: ToolContext, call = input) => {
    edits.addSetToExercise.mockClear();
    await run(addSetToExercise, call, ctx);

    return z.string().parse(edits.addSetToExercise.mock.calls[0][2].requestKey);
  };

  const alice = contextFor("user_alice");

  /**
   * One execution of a step: the AI SDK hands every tool call of it the same
   * model input array; a re-run rebuilds that input as a new array.
   */
  const attempt = (
    messages: ToolContext["messages"] = [...alice.messages]
  ) => ({
    call: (callId: string): ToolContext => ({ ...alice, callId, messages }),
  });

  it("is the same when a step re-runs and the model asks again", async () => {
    const first = await keyOf(attempt().call("call_1"));

    // Same model input, new array; the model's call gets a new id
    await expect(keyOf(attempt().call("call_9"))).resolves.toBe(first);
  });

  it("differs for identical calls in one step, and a re-run matches each", async () => {
    const firstAttempt = attempt();

    const firstKeys = [
      await keyOf(firstAttempt.call("call_1")),
      await keyOf(firstAttempt.call("call_2")),
    ];

    const rerun = attempt();

    const rerunKeys = [
      await keyOf(rerun.call("call_8")),
      await keyOf(rerun.call("call_9")),
    ];

    expect(firstKeys[0]).not.toBe(firstKeys[1]);
    expect(rerunKeys).toStrictEqual(firstKeys);
  });

  it("is the same for a re-run on the same instance right after the first attempt", async () => {
    const firstAttempt = attempt();
    const first = await keyOf(firstAttempt.call("call_1"));
    // The first attempt's calls stay known, but the re-run is its own attempt
    const rerun = attempt();

    await expect(keyOf(rerun.call("call_2"))).resolves.toBe(first);
  });

  it("stays the same for one call asked about twice", async () => {
    const step = attempt();

    await expect(keyOf(step.call("call_1"))).resolves.toBe(
      await keyOf(step.call("call_1"))
    );
  });

  it("differs on a later step of the turn", async () => {
    const laterStep = attempt([
      ...alice.messages,
      {
        content: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "test_tool",
            output: { type: "text", value: "tool result" },
          },
        ],
        role: "tool",
      },
    ]);

    await expect(keyOf(laterStep.call("call_1"))).resolves.not.toBe(
      await keyOf(attempt().call("call_1"))
    );
  });

  it("differs for different input", async () => {
    await expect(
      keyOf(alice, { ...input, reps_recommended: 12 })
    ).resolves.not.toBe(await keyOf(alice));
  });

  it("differs in another turn or session", async () => {
    const key = await keyOf(attempt().call("call_1"));

    const otherTurn: ToolContext = {
      ...attempt().call("call_1"),
      session: { ...alice.session, turn: { id: "turn_2", sequence: 2 } },
    };

    const otherSession: ToolContext = {
      ...attempt().call("call_1"),
      session: { ...alice.session, id: "wrun_other" },
    };

    await expect(keyOf(otherTurn)).resolves.not.toBe(key);
    await expect(keyOf(otherSession)).resolves.not.toBe(key);
  });
});

describe("remove_exercise_from_workout", () => {
  beforeEach(resetEdits);

  const input = { workout_exercise_id: workoutExerciseId };

  it("removes the Exercise and reports it", async () => {
    await expect(run(removeExerciseFromWorkout, input)).resolves.toStrictEqual({
      success: true,
      workout_exercise_id: workoutExerciseId,
    });
    expect(edits.removeExerciseFromWorkout).toHaveBeenCalledWith(
      tx,
      "user_alice",
      workoutExerciseId
    );
  });

  it("tells the model the Workout Exercise is gone, even when a re-run removed it", async () => {
    edits.removeExerciseFromWorkout.mockResolvedValue(false);

    await expect(run(removeExerciseFromWorkout, input)).resolves.toStrictEqual({
      error:
        "Workout exercise not found: it doesn't exist or was already removed",
    });
  });
});

describe("remove_set_from_exercise", () => {
  beforeEach(resetEdits);

  it("removes the set and reports it", async () => {
    await expect(
      run(removeSetFromExercise, { set_id: setId })
    ).resolves.toStrictEqual({
      set_id: setId,
      success: true,
    });
    expect(edits.removeSetFromExercise).toHaveBeenCalledWith(
      tx,
      "user_alice",
      setId
    );
  });

  it("tells the model when the User has no such set", async () => {
    edits.removeSetFromExercise.mockResolvedValue(false);

    await expect(
      run(removeSetFromExercise, { set_id: setId })
    ).resolves.toStrictEqual({
      error: "Set not found: it doesn't exist or was already removed",
    });
  });
});

describe("replace_exercise_in_workout", () => {
  beforeEach(resetEdits);

  const input = {
    new_exercise_slug: exerciseSlug,
    sets,
    workout_exercise_id: workoutExerciseId,
  };

  it("replaces the Exercise and reports it", async () => {
    await expect(run(replaceExerciseInWorkout, input)).resolves.toStrictEqual({
      new_exercise_slug: exerciseSlug,
      sets_replaced: 1,
      success: true,
      workout_exercise_id: workoutExerciseId,
    });
    expect(edits.replaceExerciseInWorkout).toHaveBeenCalledWith(
      tx,
      "user_alice",
      { newExerciseSlug: exerciseSlug, sets, workoutExerciseId }
    );
  });

  it("tells the model when the User has no such Workout Exercise", async () => {
    edits.replaceExerciseInWorkout.mockResolvedValue(false);

    await expect(run(replaceExerciseInWorkout, input)).resolves.toStrictEqual({
      error: "Workout exercise not found",
    });
  });
});

describe("update_set_recommendations", () => {
  beforeEach(resetEdits);

  it("changes only the given targets and reports them", async () => {
    await expect(
      run(updateSetRecommendations, {
        reps_recommended: 10,
        set_id: setId,
      })
    ).resolves.toStrictEqual({
      set_id: setId,
      success: true,
      updated: { reps_recommended: 10 },
    });
    expect(edits.updateSetRecommendations).toHaveBeenCalledWith(
      tx,
      "user_alice",
      setId,
      { reps_recommended: 10 }
    );
  });

  it("tells the model when there is nothing to change", async () => {
    await expect(
      run(updateSetRecommendations, { set_id: setId })
    ).resolves.toStrictEqual({
      error:
        "At least one of reps_recommended, weight_recommended, or rest_recommended must be provided",
    });
    expect(db.asUser).not.toHaveBeenCalled();
  });

  it("tells the model when the User has no such set", async () => {
    edits.updateSetRecommendations.mockResolvedValue(null);

    await expect(
      run(updateSetRecommendations, {
        reps_recommended: 10,
        set_id: setId,
      })
    ).resolves.toStrictEqual({ error: "Set not found" });
  });
});
