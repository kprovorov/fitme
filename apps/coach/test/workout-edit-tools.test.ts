import type { ToolContext } from "eve/tools";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodTypeAny } from "zod";
import { contextFor, userIdFields } from "./tool-context";

const db = vi.hoisted(() => ({ asUser: vi.fn() }));
const edits = vi.hoisted(() => ({
  addExerciseToWorkout: vi.fn(),
  addSetToExercise: vi.fn(),
  removeExerciseFromWorkout: vi.fn(),
  removeSetFromExercise: vi.fn(),
  replaceExerciseInWorkout: vi.fn(),
  updateSetRecommendations: vi.fn(),
}));
vi.mock("@fitme/db", () => db);
vi.mock("@fitme/services/workout-edits", () => edits);

const plans = vi.hoisted(() => ({
  UnknownExercisesError: class FakeUnknownExercisesError extends Error {
    constructor(exerciseIds: string[]) {
      super(`Unknown exercise_id(s): ${exerciseIds.join(", ")}`);
    }
  },
}));
vi.mock("@fitme/services/plans", () => plans);
const { UnknownExercisesError } = plans;

const { default: addExerciseToWorkout } = await import(
  "../agent/tools/add_exercise_to_workout"
);
const { default: addSetToExercise } = await import(
  "../agent/tools/add_set_to_exercise"
);
const { default: removeExerciseFromWorkout } = await import(
  "../agent/tools/remove_exercise_from_workout"
);
const { default: removeSetFromExercise } = await import(
  "../agent/tools/remove_set_from_exercise"
);
const { default: replaceExerciseInWorkout } = await import(
  "../agent/tools/replace_exercise_in_workout"
);
const { default: updateSetRecommendations } = await import(
  "../agent/tools/update_set_recommendations"
);

const tx = { fake: "transaction" };
const workoutId = "a0000000-0000-4000-8000-000000000001";
const workoutExerciseId = "b0000000-0000-4000-8000-000000000001";
const exerciseId = "c0000000-0000-4000-8000-000000000001";
const setId = "d0000000-0000-4000-8000-000000000001";
const sets = [
  { reps_recommended: 8, rest_recommended: 90, weight_recommended: 60 },
];
const [newSet] = sets;

interface Tool {
  execute: (input: never, ctx: ToolContext) => unknown;
  inputSchema: unknown;
}

/** What eve hands `execute` after validating the model's input. */
const parseInput = (tool: Tool, input: unknown) =>
  (tool.inputSchema as ZodTypeAny).parse(input);
const run = (tool: Tool, input: unknown, ctx = contextFor("user_alice")) =>
  tool.execute(parseInput(tool, input) as never, ctx);

const serviceCalls = () =>
  JSON.stringify([
    db.asUser.mock.calls,
    ...Object.values(edits).map((service) => service.mock.calls),
  ]);

const cases: {
  input: Record<string, unknown>;
  name: string;
  service: keyof typeof edits;
  tool: Tool;
}[] = [
  {
    input: { exercise_id: exerciseId, sets, workout_id: workoutId },
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
      new_exercise_id: exerciseId,
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

beforeEach(() => {
  db.asUser.mockImplementation((_userId, fn) => fn(tx));
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
});

describe.each(cases)("$name", ({ input, service, tool }) => {
  it("edits as the session's User, in one asUser transaction", async () => {
    await run(tool, input);

    expect(db.asUser).toHaveBeenCalledOnce();
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(edits[service]).toHaveBeenCalledWith(
      tx,
      "user_alice",
      ...Array.from({ length: edits[service].mock.calls[0].length - 2 }).map(
        () => expect.anything()
      )
    );
  });

  it("ignores any User id in its input", async () => {
    const parsed = parseInput(tool, { ...input, ...userIdFields });

    await tool.execute(parsed as never, contextFor("user_alice"));

    expect(parsed).toEqual(input);
    expect(serviceCalls()).not.toContain("user_mallory");
  });

  it("acts as the session's owner, never the turn's caller", async () => {
    await run(tool, input, contextFor("user_alice", "user_mallory"));

    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(serviceCalls()).not.toContain("user_mallory");
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(run(tool, input, contextFor(null))).rejects.toThrow();
    expect(db.asUser).not.toHaveBeenCalled();
  });

  it("rejects ids that aren't uuids", () => {
    const withBadIds = Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        key.endsWith("id") ? "latest" : value,
      ])
    );

    expect((tool.inputSchema as ZodTypeAny).safeParse(withBadIds).success).toBe(
      false
    );
  });
});

describe("add_exercise_to_workout", () => {
  const input = { exercise_id: exerciseId, sets, workout_id: workoutId };

  it("adds the Exercise and reports it", async () => {
    expect(await run(addExerciseToWorkout, input)).toEqual({
      sets_added: 1,
      success: true,
      workout_exercise_id: workoutExerciseId,
    });
    expect(edits.addExerciseToWorkout).toHaveBeenCalledWith(tx, "user_alice", {
      exerciseId,
      requestKey: expect.any(String),
      sets,
      workoutId,
    });
  });

  it("tells the model when the User has no such Workout", async () => {
    edits.addExerciseToWorkout.mockResolvedValue(null);

    expect(await run(addExerciseToWorkout, input)).toEqual({
      error: "Workout not found",
    });
  });

  it("tells the model when the Exercise isn't in the library", async () => {
    edits.addExerciseToWorkout.mockRejectedValue(
      new UnknownExercisesError([exerciseId])
    );

    expect(await run(addExerciseToWorkout, input)).toEqual({
      error: `Unknown exercise_id(s): ${exerciseId}`,
    });
  });

  it("needs at least one set", () => {
    expect(
      (addExerciseToWorkout.inputSchema as ZodTypeAny).safeParse({
        ...input,
        sets: [],
      }).success
    ).toBe(false);
  });
});

describe("add_set_to_exercise", () => {
  const input = { ...newSet, workout_exercise_id: workoutExerciseId };

  it("appends the set and reports it", async () => {
    expect(await run(addSetToExercise, input)).toEqual({
      order: 3,
      set_id: setId,
      success: true,
    });
    expect(edits.addSetToExercise).toHaveBeenCalledWith(tx, "user_alice", {
      requestKey: expect.any(String),
      set: newSet,
      workoutExerciseId,
    });
  });

  it("tells the model when the User has no such Workout Exercise", async () => {
    edits.addSetToExercise.mockResolvedValue(null);

    expect(await run(addSetToExercise, input)).toEqual({
      error: "Workout exercise not found",
    });
  });
});

describe("request keys", () => {
  const input = { ...newSet, workout_exercise_id: workoutExerciseId };
  const keyOf = async (ctx: ToolContext, call = input) => {
    edits.addSetToExercise.mockClear();
    await run(addSetToExercise, call, ctx);
    return edits.addSetToExercise.mock.calls[0][2].requestKey as string;
  };
  const alice = contextFor("user_alice");
  const withCallId = (callId: string) =>
    ({ ...alice, callId }) as unknown as ToolContext;
  const onStep = (messages: unknown[]) =>
    ({ ...alice, messages }) as unknown as ToolContext;
  /** How long after an attempt a step re-runs: a crash, redeploy or timeout. */
  const RERUN_DELAY_MS = 10 * 60 * 1000;
  // Keeps moving forward across tests; useFakeTimers resets the clock
  let clock = Date.now();
  const rerunLater = () => {
    clock += RERUN_DELAY_MS;
    vi.setSystemTime(clock);
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Every test starts long after the last one's calls
    rerunLater();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is the same when a step re-runs and the model asks again", async () => {
    const first = await keyOf(withCallId("call_1"));
    rerunLater();

    // A re-run step replays the same model input; the model's call gets a new id
    expect(await keyOf(withCallId("call_9"))).toBe(first);
  });

  it("differs for identical calls in one step, and a re-run matches each", async () => {
    const firstAttempt = [
      await keyOf(withCallId("call_1")),
      await keyOf(withCallId("call_2")),
    ];
    rerunLater();
    const rerun = [
      await keyOf(withCallId("call_8")),
      await keyOf(withCallId("call_9")),
    ];

    expect(firstAttempt[0]).not.toBe(firstAttempt[1]);
    expect(rerun).toEqual(firstAttempt);
  });

  it("stays the same for one call asked about twice", async () => {
    expect(await keyOf(withCallId("call_1"))).toBe(
      await keyOf(withCallId("call_1"))
    );
  });

  it("differs on a later step of the turn", async () => {
    const laterStep = onStep([
      ...alice.messages,
      { content: "tool result", role: "tool" },
    ]);

    expect(await keyOf(laterStep)).not.toBe(await keyOf(alice));
  });

  it("differs for different input", async () => {
    expect(await keyOf(alice, { ...input, reps_recommended: 12 })).not.toBe(
      await keyOf(alice)
    );
  });

  it("differs in another turn or session", async () => {
    const key = await keyOf(alice);
    const otherTurn = {
      ...alice,
      session: { ...alice.session, turn: { id: "turn_2", sequence: 2 } },
    } as ToolContext;
    const otherSession = {
      ...alice,
      session: { ...alice.session, id: "wrun_other" },
    } as ToolContext;

    expect(await keyOf(otherTurn)).not.toBe(key);
    expect(await keyOf(otherSession)).not.toBe(key);
  });
});

describe("remove_exercise_from_workout", () => {
  const input = { workout_exercise_id: workoutExerciseId };

  it("removes the Exercise and reports it", async () => {
    expect(await run(removeExerciseFromWorkout, input)).toEqual({
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

    expect(await run(removeExerciseFromWorkout, input)).toEqual({
      error:
        "Workout exercise not found: it doesn't exist or was already removed",
    });
  });
});

describe("remove_set_from_exercise", () => {
  it("removes the set and reports it", async () => {
    expect(await run(removeSetFromExercise, { set_id: setId })).toEqual({
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

    expect(await run(removeSetFromExercise, { set_id: setId })).toEqual({
      error: "Set not found: it doesn't exist or was already removed",
    });
  });
});

describe("replace_exercise_in_workout", () => {
  const input = {
    new_exercise_id: exerciseId,
    sets,
    workout_exercise_id: workoutExerciseId,
  };

  it("replaces the Exercise and reports it", async () => {
    expect(await run(replaceExerciseInWorkout, input)).toEqual({
      new_exercise_id: exerciseId,
      sets_replaced: 1,
      success: true,
      workout_exercise_id: workoutExerciseId,
    });
    expect(edits.replaceExerciseInWorkout).toHaveBeenCalledWith(
      tx,
      "user_alice",
      { newExerciseId: exerciseId, sets, workoutExerciseId }
    );
  });

  it("tells the model when the User has no such Workout Exercise", async () => {
    edits.replaceExerciseInWorkout.mockResolvedValue(false);

    expect(await run(replaceExerciseInWorkout, input)).toEqual({
      error: "Workout exercise not found",
    });
  });

  it("tells the model when the Exercise isn't in the library", async () => {
    edits.replaceExerciseInWorkout.mockRejectedValue(
      new UnknownExercisesError([exerciseId])
    );

    expect(await run(replaceExerciseInWorkout, input)).toEqual({
      error: `Unknown exercise_id(s): ${exerciseId}`,
    });
  });
});

describe("update_set_recommendations", () => {
  it("changes only the given targets and reports them", async () => {
    expect(
      await run(updateSetRecommendations, {
        reps_recommended: 10,
        set_id: setId,
      })
    ).toEqual({
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
    expect(await run(updateSetRecommendations, { set_id: setId })).toEqual({
      error:
        "At least one of reps_recommended, weight_recommended, or rest_recommended must be provided",
    });
    expect(db.asUser).not.toHaveBeenCalled();
  });

  it("tells the model when the User has no such set", async () => {
    edits.updateSetRecommendations.mockResolvedValue(null);

    expect(
      await run(updateSetRecommendations, {
        reps_recommended: 10,
        set_id: setId,
      })
    ).toEqual({ error: "Set not found" });
  });
});
