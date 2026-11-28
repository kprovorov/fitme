import { arnoldCardIds } from "@fitme/core/arnold";
import type * as Db from "@fitme/db";
import type * as Observability from "@fitme/observability/node";
import type * as PlanServices from "@fitme/services/plans";
import type { PlanDetail, PlanSummary } from "@fitme/services/plans";
import type * as ProfileServices from "@fitme/services/profile";
import type * as SessionServices from "@fitme/services/workout-sessions";
import type { WorkoutSessionDetail } from "@fitme/services/workout-sessions";
import type { HistoryMessage } from "eve/context";
import type { ToolContext } from "eve/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as LibraryModule from "../agent/lib/library";
import { testLibrary } from "./library";
import { contextFor, inputSchemaOf, userIdFields } from "./tool-context";

type ReadTransaction = (transaction: typeof tx) => Promise<unknown>;

const db = vi.hoisted(() => ({
  asUser: vi.fn<(userId: string, fn: ReadTransaction) => Promise<unknown>>(),
}));

const plans = vi.hoisted(() => ({
  getPlan: vi.fn<typeof PlanServices.getPlan>(),
  listPlans: vi.fn<typeof PlanServices.listPlans>(),
}));

const sessions = vi.hoisted(() => ({
  getWorkoutSession: vi.fn<typeof SessionServices.getWorkoutSession>(),
}));

const profile = vi.hoisted(() => ({
  getProfile: vi.fn<typeof ProfileServices.getProfile>(),
}));

const observability = vi.hoisted(() => ({
  reportError: vi.fn<typeof Observability.reportError>(),
}));

vi.mock<typeof Db | typeof db>(import("@fitme/db"), () => db);

vi.mock<typeof PlanServices | typeof plans>(
  import("@fitme/services/plans"),
  () => plans
);

vi.mock<typeof SessionServices | typeof sessions>(
  import("@fitme/services/workout-sessions"),
  () => sessions
);

vi.mock<typeof ProfileServices | typeof profile>(
  import("@fitme/services/profile"),
  () => profile
);

vi.mock<typeof Observability>(
  import("@fitme/observability/node"),
  () => observability
);

vi.mock<typeof LibraryModule>(import("../agent/lib/library"), async () => {
  const { testLibrary: library } = await import("./library");

  return { getLibrary: () => library.get() };
});

const showExercises = await import("../agent/tools/show_exercises");
const showWorkout = await import("../agent/tools/show_workout");
const showPlan = await import("../agent/tools/show_plan");
const showWorkoutSession = await import("../agent/tools/show_workout_session");
const showProfile = await import("../agent/tools/show_profile");

const tx = { fake: "transaction" };

const alice = contextFor("user_alice");

const PLAN_ID = "0f5c8c1e-7a43-4c4e-9f7a-1d2b3c4d5e6f";
const WORKOUT_ID = "6a1d0c9e-3b2f-4e8a-9c7d-5e4f3a2b1c0d";
const SESSION_ID = "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const MISSING_ID = "11111111-2222-4333-8444-555555555555";

const EVE_DYNAMIC = Symbol.for("eve.dynamic");

type Resolver = (ctx: {
  messages: () => Promise<readonly HistoryMessage[]>;
}) => Promise<unknown>;

const isResolver = (value: unknown): value is Resolver =>
  typeof value === "function";

/**
 * What eve offers on a model call whose client context lists `cards` (no
 * list at all for `undefined`, an old build): it resolves the tool file's
 * default export, a `defineDynamic()` value, from the call's messages.
 */
const offered = async (
  dynamic: unknown,
  cards: readonly string[] | undefined
): Promise<unknown> => {
  const resolve: unknown =
    typeof dynamic === "object" && dynamic !== null
      ? Object.getOwnPropertyDescriptor(dynamic, EVE_DYNAMIC)?.value
      : undefined;

  if (!isResolver(resolve)) {
    throw new Error("Expected a defineDynamic() value");
  }

  const clientContext = { cards, language: "en" };

  const message = {
    content: `Client context:\n${JSON.stringify(clientContext)}`,
    kind: "context.instruction",
    role: "user",
  } as const;

  return await resolve({ messages: () => Promise.resolve([message]) });
};

const PLAN_INPUT = { plan_id: PLAN_ID };
const WORKOUT_INPUT = { workout_id: WORKOUT_ID };
const SESSION_INPUT = { workout_session_id: SESSION_ID };

/** Each show tool, its card, and a call of it with a valid input. */
const showTools = [
  {
    card: "exercises",
    call: (ctx: ToolContext) =>
      showExercises.tool.execute({ exercise_slugs: ["bench-press"] }, ctx),
    module: showExercises,
  },
  {
    card: "workout",
    call: (ctx: ToolContext) => showWorkout.tool.execute(WORKOUT_INPUT, ctx),
    module: showWorkout,
  },
  {
    card: "plan",
    call: (ctx: ToolContext) => showPlan.tool.execute(PLAN_INPUT, ctx),
    module: showPlan,
  },
  {
    card: "workout_session",
    call: (ctx: ToolContext) =>
      showWorkoutSession.tool.execute(SESSION_INPUT, ctx),
    module: showWorkoutSession,
  },
  {
    card: "profile",
    call: (ctx: ToolContext) => showProfile.tool.execute({}, ctx),
    module: showProfile,
  },
] as const;

const planSummary = (
  id: string,
  workoutIds: readonly string[]
): PlanSummary => ({
  created_at: null,
  description: null,
  experience_level: null,
  frequency: 3,
  goal: null,
  id,
  is_active: true,
  name: "Push pull",
  note: null,
  place: null,
  updated_at: null,
  workout_duration: null,
  workouts: workoutIds.map((workoutId, index) => ({
    cover: null,
    exercise_count: 2,
    id: workoutId,
    name: `Workout ${index + 1}`,
    order: index + 1,
  })),
});

const planDetail: PlanDetail = {
  ...planSummary(PLAN_ID, []),
  workouts: [],
};

const sessionDetail: WorkoutSessionDetail = {
  exercises: [],
  finished_at: "2026-11-20T10:00:00Z",
  id: SESSION_ID,
  plan: null,
  started_at: "2026-11-20T09:00:00Z",
  status: "finished",
  workout: null,
};

const aliceProfile: ProfileServices.ProfileWithUnits = {
  age: 30,
  gender: "female",
  height: 170,
  measurement_system: "metric",
  units: { height: "cm", weight: "kg" },
  weight: 60,
};

const setUp = () => {
  vi.clearAllMocks();
  db.asUser.mockImplementation(async (_userId, fn) => await fn(tx));
  testLibrary.reset();
  observability.reportError.mockResolvedValue(undefined);
};

describe.each(showTools)(
  "the $card card's show tool",
  ({ call, card, module }) => {
    beforeEach(setUp);

    it(`is offered to a build that can draw the ${card} card`, async () => {
      await expect(offered(module.default, [card])).resolves.toBe(module.tool);
      await expect(offered(module.default, [...arnoldCardIds])).resolves.toBe(
        module.tool
      );
    });

    it(`isn't offered to a build without the ${card} card`, async () => {
      const others = arnoldCardIds.filter((id) => id !== card);

      await expect(offered(module.default, others)).resolves.toBeNull();
      await expect(offered(module.default, [])).resolves.toBeNull();
      // An old build, which sent no list
      await expect(offered(module.default, undefined)).resolves.toBeNull();
    });

    it("refuses to run without a Clerk User owning the session", async () => {
      await expect(call(contextFor(null))).rejects.toThrow(
        "This Conversation has no signed-in owner"
      );
      expect(db.asUser).not.toHaveBeenCalled();
    });
  }
);

describe("show_exercises", () => {
  beforeEach(setUp);

  const { tool } = showExercises;

  it("answers the Exercises' slugs in the order asked", async () => {
    const input = inputSchemaOf(tool).parse({
      exercise_slugs: ["back-squat", "bench-press", "plank"],
    });

    await expect(tool.execute(input, alice)).resolves.toStrictEqual({
      exercise_slugs: ["back-squat", "bench-press", "plank"],
    });
    // The Library is in process: no database
    expect(db.asUser).not.toHaveBeenCalled();
  });

  it("answers a replaced slug as the Exercise replacing it", async () => {
    const input = inputSchemaOf(tool).parse({
      exercise_slugs: ["plank", "barbell-bench-press"],
    });

    await expect(tool.execute(input, alice)).resolves.toStrictEqual({
      exercise_slugs: ["plank", "bench-press"],
    });
  });

  it("shows an Exercise asked for twice once", async () => {
    const input = inputSchemaOf(tool).parse({
      exercise_slugs: ["barbell-bench-press", "bench-press", "bench-press"],
    });

    await expect(tool.execute(input, alice)).resolves.toStrictEqual({
      exercise_slugs: ["bench-press"],
    });
  });

  it("throws for an unknown slug, naming it", async () => {
    const input = inputSchemaOf(tool).parse({
      exercise_slugs: ["bench-press", "made-up-press"],
    });

    await expect(tool.execute(input, alice)).rejects.toThrow(
      "Unknown exercise_slug(s): made-up-press. Use search_exercises"
    );
  });

  it("throws when the Library can't load", async () => {
    testLibrary.reset({ loads: "fail" });

    const input = inputSchemaOf(tool).parse({
      exercise_slugs: ["bench-press"],
    });

    await expect(tool.execute(input, alice)).rejects.toThrow(
      "The exercise library is unavailable right now"
    );
  });

  it("takes one to eight slugs", () => {
    const schema = inputSchemaOf(tool);

    expect(schema.safeParse({ exercise_slugs: [] }).success).toBeFalsy();
    expect(
      schema.safeParse({
        exercise_slugs: Array.from({ length: 9 }, () => "plank"),
      }).success
    ).toBeFalsy();
    expect(
      schema.safeParse({
        exercise_slugs: Array.from({ length: 8 }, () => "plank"),
      }).success
    ).toBeTruthy();
  });
});

describe("show_workout", () => {
  beforeEach(setUp);

  const { tool } = showWorkout;

  it("answers the Workout's id and its Plan's id, read as the session's User", async () => {
    plans.listPlans.mockResolvedValue([
      planSummary("plan_other", [MISSING_ID.replace("1", "7")]),
      planSummary(PLAN_ID, [WORKOUT_ID]),
    ]);

    const input = inputSchemaOf(tool).parse({
      workout_id: WORKOUT_ID.toUpperCase(),
    });

    await expect(tool.execute(input, alice)).resolves.toStrictEqual({
      plan_id: PLAN_ID,
      workout_id: WORKOUT_ID,
    });
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(plans.listPlans).toHaveBeenCalledWith(tx, "user_alice");
  });

  it("throws for a Workout that isn't in the User's Plans (missing, another User's, or of a deleted Plan)", async () => {
    // listPlans answers the User's live Plans only: a deleted Plan's
    // Workouts and another User's are never among them
    plans.listPlans.mockResolvedValue([planSummary(PLAN_ID, [WORKOUT_ID])]);

    const input = inputSchemaOf(tool).parse({ workout_id: MISSING_ID });

    await expect(tool.execute(input, alice)).rejects.toThrow(
      `No workout ${MISSING_ID} in the user's plans`
    );
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(plans.listPlans).toHaveBeenCalledWith(tx, "user_alice");
  });

  it("refuses a Workout of a deleted Plan", async () => {
    // The Plan was deleted: listPlans no longer answers it
    plans.listPlans.mockResolvedValue([]);

    const input = inputSchemaOf(tool).parse({ workout_id: WORKOUT_ID });

    await expect(tool.execute(input, alice)).rejects.toThrow(
      "its plan was deleted"
    );
  });

  it("acts as the session's User whatever its input says", async () => {
    plans.listPlans.mockResolvedValue([planSummary(PLAN_ID, [WORKOUT_ID])]);

    const input = inputSchemaOf(tool).parse({
      workout_id: WORKOUT_ID,
      ...userIdFields,
    });

    await tool.execute(input, alice);

    expect(input).toStrictEqual({ workout_id: WORKOUT_ID });
    expect(JSON.stringify(db.asUser.mock.calls)).not.toContain("user_mallory");
  });

  it("takes only an id", () => {
    expect(
      inputSchemaOf(tool).safeParse({ workout_id: "Push day" }).success
    ).toBeFalsy();
  });
});

describe("show_plan", () => {
  beforeEach(setUp);

  const { tool } = showPlan;

  it("answers the Plan's id, read as the session's User", async () => {
    plans.getPlan.mockResolvedValue(planDetail);

    const input = inputSchemaOf(tool).parse({ plan_id: PLAN_ID });

    await expect(tool.execute(input, alice)).resolves.toStrictEqual({
      plan_id: PLAN_ID,
    });
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(plans.getPlan).toHaveBeenCalledWith(tx, "user_alice", PLAN_ID);
  });

  it("throws for a missing, deleted or another User's Plan", async () => {
    // getPlan answers null for each of them
    plans.getPlan.mockResolvedValue(null);

    const input = inputSchemaOf(tool).parse({ plan_id: MISSING_ID });

    await expect(tool.execute(input, alice)).rejects.toThrow(
      `No plan ${MISSING_ID} for the user`
    );
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(plans.getPlan).toHaveBeenCalledWith(tx, "user_alice", MISSING_ID);
  });

  it("takes only an id", () => {
    expect(
      inputSchemaOf(tool).safeParse({ plan_id: "My plan" }).success
    ).toBeFalsy();
  });
});

describe("show_workout_session", () => {
  beforeEach(setUp);

  const { tool } = showWorkoutSession;

  it("answers the Workout Session's id, read as the session's User", async () => {
    sessions.getWorkoutSession.mockResolvedValue(sessionDetail);

    const input = inputSchemaOf(tool).parse({
      workout_session_id: SESSION_ID,
    });

    await expect(tool.execute(input, alice)).resolves.toStrictEqual({
      workout_session_id: SESSION_ID,
    });
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(sessions.getWorkoutSession).toHaveBeenCalledWith(tx, SESSION_ID);
  });

  it("throws for a missing or another User's Workout Session", async () => {
    // RLS hides another User's, so getWorkoutSession answers null
    sessions.getWorkoutSession.mockResolvedValue(null);

    const input = inputSchemaOf(tool).parse({
      workout_session_id: MISSING_ID,
    });

    await expect(tool.execute(input, alice)).rejects.toThrow(
      `No workout session ${MISSING_ID} for the user`
    );
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
  });
});

describe("show_profile", () => {
  beforeEach(setUp);

  const { tool } = showProfile;

  it("answers nothing but success when the User has a Profile", async () => {
    profile.getProfile.mockResolvedValue(aliceProfile);

    const input = inputSchemaOf(tool).parse(userIdFields);

    await expect(tool.execute(input, alice)).resolves.toStrictEqual({});
    expect(input).toStrictEqual({});
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(profile.getProfile).toHaveBeenCalledWith(tx, "user_alice");
  });

  it("throws for a User with no Profile", async () => {
    // RLS hides every other User's Profile, so only the owner's is read
    profile.getProfile.mockResolvedValue(null);

    await expect(tool.execute({}, alice)).rejects.toThrow(
      "The user has no profile yet"
    );
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(profile.getProfile).toHaveBeenCalledWith(tx, "user_alice");
  });
});
