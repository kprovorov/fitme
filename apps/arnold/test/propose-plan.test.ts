import type * as Db from "@fitme/db";
import type * as Observability from "@fitme/observability/node";
import type * as ProposalServices from "@fitme/services/plan-proposals";
import type * as PlanServices from "@fitme/services/plans";
import type { PlanDetail } from "@fitme/services/plans";
import type { ToolContext } from "eve/tools";
import type { ApprovalContext, ApprovalStatus } from "eve/tools/approval";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as LibraryModule from "../agent/lib/library";
import type * as LibraryIndexModule from "../agent/lib/library-index";
import { PLAN_CHANGED } from "../agent/lib/plan-proposals";
import type { PlanProposalInput } from "../agent/lib/plan-proposals";
import { testLibrary } from "./library";
import { CHEST_COVERS, testLibraryIndex } from "./library-index";
import {
  contextFor,
  inputSchemaOf,
  offeredTo,
  userIdFields,
  withClientContext,
} from "./tool-context";

type Transaction = (transaction: typeof tx) => Promise<unknown>;

const db = vi.hoisted(() => ({
  asUser: vi.fn<(userId: string, fn: Transaction) => Promise<unknown>>(),
}));

const plans = vi.hoisted(() => ({
  getPlan: vi.fn<typeof PlanServices.getPlan>(),
}));

const proposals = vi.hoisted(() => ({
  savePlanProposal: vi.fn<typeof ProposalServices.savePlanProposal>(),
}));

const observability = vi.hoisted(() => ({
  reportError: vi.fn<typeof Observability.reportError>(),
}));

vi.mock<typeof Db | typeof db>(import("@fitme/db"), () => db);

vi.mock<typeof PlanServices | typeof plans>(
  import("@fitme/services/plans"),
  () => plans
);

// The real version marker, the save mocked
vi.mock<typeof ProposalServices>(
  import("@fitme/services/plan-proposals"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    savePlanProposal: proposals.savePlanProposal,
  })
);

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

const proposePlan = await import("../agent/tools/propose_plan");
const { planVersion } = await import("@fitme/services/plan-proposals");

const tx = { fake: "transaction" };

const PLAN_ID = "0f5c8c1e-7a43-4c4e-9f7a-1d2b3c4d5e6f";
const PUSH_ID = "6a1d0c9e-3b2f-4e8a-9c7d-5e4f3a2b1c0d";
const LEGS_ID = "7b2e1d0f-4c3a-4f9b-8d6e-6f5a4b3c2d1e";
const BENCH_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const SQUAT_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const BENCH_SET_1 = "3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f";
const BENCH_SET_2 = "4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f8a";
const SQUAT_SET = "5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8a9b";

const PUSH: PlanDetail["workouts"][number] = {
  cover: CHEST_COVERS[0],
  description: "",
  exercises: [
    {
      exercise_slug: "bench-press",
      id: BENCH_ID,
      order: 1,
      sets: [
        {
          id: BENCH_SET_1,
          order: 1,
          reps_recommended: 8,
          rest_recommended: 120,
          weight_recommended: 60,
        },
        {
          id: BENCH_SET_2,
          order: 2,
          reps_recommended: 8,
          rest_recommended: 120,
          weight_recommended: 60,
        },
      ],
    },
  ],
  id: PUSH_ID,
  name: "Push",
  order: 1,
};

const LEGS: PlanDetail["workouts"][number] = {
  cover: null,
  description: "",
  exercises: [
    {
      exercise_slug: "back-squat",
      id: SQUAT_ID,
      order: 1,
      sets: [
        {
          id: SQUAT_SET,
          order: 1,
          reps_recommended: 5,
          rest_recommended: 180,
          weight_recommended: 100,
        },
      ],
    },
  ],
  id: LEGS_ID,
  name: "Legs",
  order: 2,
};

const plan: PlanDetail = {
  created_at: "2026-11-01T10:00:00+00:00",
  description: "Two days",
  experience_level: "intermediate",
  frequency: 2,
  goal: "strength",
  id: PLAN_ID,
  is_active: true,
  name: "Strength",
  note: null,
  place: "gym",
  updated_at: "2026-11-01T10:00:00+00:00",
  workout_duration: 60,
  workouts: [PUSH, LEGS],
};

const VERSION = planVersion(plan);

type ProposedSet = NonNullable<
  PlanProposalInput["workouts"]
>[number]["exercises"][number]["sets"][number];

type ProposedExercise = NonNullable<
  PlanProposalInput["workouts"]
>[number]["exercises"][number];

/** A bench set at 8 × 62.5 kg, resting 2 minutes, unless overridden. */
const benchSet = (overrides: Partial<ProposedSet> = {}): ProposedSet => ({
  reps_recommended: 8,
  rest_recommended: 120,
  weight_recommended: 62.5,
  ...overrides,
});

/**
 * Push sent back with its bench press's `sets` (by default both kept sets
 * heavier and a third one added) and any `extra` Exercises: one changed
 * Workout.
 */
const pushWith = ({
  extra = [],
  sets = [
    benchSet({ id: BENCH_SET_1 }),
    benchSet({ id: BENCH_SET_2 }),
    benchSet(),
  ],
  workoutId = PUSH_ID,
}: {
  extra?: ProposedExercise[];
  sets?: ProposedSet[];
  workoutId?: string;
} = {}): PlanProposalInput => ({
  plan_id: PLAN_ID,
  plan_version: VERSION,
  workouts: [
    {
      description: "",
      exercises: [
        { exercise_slug: "bench-press", id: BENCH_ID, sets },
        ...extra,
      ],
      id: workoutId,
      name: "Push",
    },
  ],
});

const heavierPush = () => pushWith();

/** A new pull Workout appended to the rotation. */
const newPull = (): PlanProposalInput => ({
  plan_id: PLAN_ID,
  plan_version: VERSION,
  workouts: [
    {
      description: "",
      exercises: [
        {
          exercise_slug: "pull-up",
          sets: [
            {
              reps_recommended: 6,
              rest_recommended: 120,
              weight_recommended: 0,
            },
          ],
        },
      ],
      name: "Pull",
    },
  ],
});

const alice = contextFor("user_alice");

const approvalContext = (
  toolInput: unknown,
  {
    callId = "call_1",
    ctx = alice,
  }: { callId?: string; ctx?: ToolContext } = {}
): ApprovalContext<unknown> => ({
  abortSignal: new AbortController().signal,
  callId,
  getSandbox: ctx.getSandbox,
  session: ctx.session,
  toolInput,
  toolName: "propose_plan",
});

interface ProposeTool {
  approval: {
    prompt: (context: never) => string;
    request: (ctx: ApprovalContext<unknown>) => Promise<ApprovalStatus>;
  };
  execute: (input: PlanProposalInput, ctx: ToolContext) => Promise<unknown>;
  inputSchema: unknown;
}

const isProposeTool = (tool: unknown): tool is ProposeTool =>
  typeof tool === "object" &&
  tool !== null &&
  "approval" in tool &&
  "execute" in tool;

/** A fresh copy, as eve builds one before each model call. */
const freshTool = (): ProposeTool => {
  const tool: unknown = proposePlan.createProposePlan();

  if (!isProposeTool(tool)) {
    throw new TypeError("Expected propose_plan with an approval policy");
  }

  return tool;
};

const check = async (
  toolInput: unknown,
  options?: { callId?: string; ctx?: ToolContext },
  tool = freshTool()
) => await tool.approval.request(approvalContext(toolInput, options));

const denialReason = (status: ApprovalStatus): string => {
  if (
    typeof status !== "object" ||
    status === null ||
    status.type !== "denied"
  ) {
    throw new Error(`Expected a denial, got ${JSON.stringify(status)}`);
  }

  return status.reason ?? "";
};

const saved = {
  changes: {
    exercisesAdded: 0,
    exercisesRemoved: 0,
    setsAdded: 1,
    setsChanged: 2,
    setsRemoved: 0,
    workoutsAdded: 0,
    workoutsChanged: 1,
    workoutsRemoved: 0,
  },
  planId: PLAN_ID,
  status: "saved" as const,
};

describe("propose_plan", () => {
  beforeEach(() => {
    db.asUser.mockReset();
    db.asUser.mockImplementation(async (_userId, fn) => await fn(tx));
    plans.getPlan.mockReset();
    plans.getPlan.mockResolvedValue(plan);
    proposals.savePlanProposal.mockReset();
    proposals.savePlanProposal.mockResolvedValue(saved);
    observability.reportError.mockReset();
    observability.reportError.mockResolvedValue(undefined);
    testLibrary.reset();
    testLibraryIndex.reset();
  });

  describe("offer", () => {
    it("is offered to a build that can draw the Plan Proposal", async () => {
      const offered = await offeredTo(
        proposePlan.default,
        withClientContext(alice, { cards: ["plan_proposal"], language: "en" })
      );

      expect(isProposeTool(offered)).toBeTruthy();
    });

    it("isn't offered without plan_proposal in the list, or to an old build", async () => {
      await expect(
        offeredTo(
          proposePlan.default,
          withClientContext(alice, { cards: ["plan"], language: "en" })
        )
      ).resolves.toBeNull();

      await expect(
        offeredTo(
          proposePlan.default,
          withClientContext(alice, { language: "en" })
        )
      ).resolves.toBeNull();
    });
  });

  describe("approval policy", () => {
    it("holds a valid proposal for the User, writing nothing", async () => {
      await expect(check(heavierPush())).resolves.toBe("user-approval");

      expect(db.asUser).toHaveBeenCalledWith(
        "user_alice",
        expect.any(Function)
      );
      expect(plans.getPlan).toHaveBeenCalledWith(tx, "user_alice", PLAN_ID);
      expect(proposals.savePlanProposal).not.toHaveBeenCalled();
    });

    it("holds a proposal adding a Workout, a removal or a details change", async () => {
      await expect(check(newPull())).resolves.toBe("user-approval");

      await expect(
        check({
          plan_id: PLAN_ID,
          plan_version: VERSION,
          removed_workout_ids: [LEGS_ID],
        })
      ).resolves.toBe("user-approval");

      await expect(
        check({
          details: { frequency: 3, goal: null },
          plan_id: PLAN_ID,
          plan_version: VERSION,
        })
      ).resolves.toBe("user-approval");
    });

    it("refuses an unknown Exercise slug, naming it", async () => {
      const input = pushWith({
        extra: [{ exercise_slug: "made-up-press", sets: [benchSet()] }],
      });

      const reason = denialReason(await check(input));

      expect(reason).toContain("made-up-press");
      expect(reason).toContain("search_exercises");
    });

    it("checks only the slugs a proposal brings in, not an untouched one's", async () => {
      // The bench press is stored under a slug the Library no longer has
      const stale = {
        ...plan,
        workouts: [
          {
            ...PUSH,
            exercises: [{ ...PUSH.exercises[0], exercise_slug: "gone-press" }],
          },
          LEGS,
        ],
      };

      plans.getPlan.mockResolvedValue(stale);

      const input = pushWith({
        extra: [
          {
            exercise_slug: "plank",
            sets: [benchSet({ weight_recommended: 0 })],
          },
        ],
      });

      const kept = {
        ...input,
        plan_version: planVersion(stale),
        workouts: input.workouts?.map((workout) => ({
          ...workout,
          exercises: workout.exercises.map((exercise) =>
            exercise.id === BENCH_ID
              ? { ...exercise, exercise_slug: "gone-press" }
              : exercise
          ),
        })),
      };

      await expect(check(kept)).resolves.toBe("user-approval");
    });

    it("refuses a row id that isn't the Plan's under its parent, naming it", async () => {
      const foreignWorkout = pushWith({
        workoutId: "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a",
      });

      expect(denialReason(await check(foreignWorkout))).toContain(
        "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a"
      );

      // A squat set sent under the bench press
      const movedSet = pushWith({
        sets: [
          benchSet({ id: BENCH_SET_1 }),
          benchSet({ id: BENCH_SET_2 }),
          benchSet({ id: SQUAT_SET }),
        ],
      });

      expect(denialReason(await check(movedSet))).toContain(SQUAT_SET);

      const removedTwice = denialReason(
        await check({
          plan_id: PLAN_ID,
          plan_version: VERSION,
          removed_workout_ids: [LEGS_ID, LEGS_ID],
        })
      );

      expect(removedTwice).toContain(LEGS_ID);
    });

    it("refuses a value out of a Plan write's bounds, naming the field", async () => {
      const noReps = pushWith({ sets: [benchSet({ reps_recommended: 0 })] });

      expect(denialReason(await check(noReps))).toContain(
        "workouts.0.exercises.0.sets.0.reps_recommended"
      );

      const tooPrecise = pushWith({
        sets: [benchSet({ weight_recommended: 62.555 })],
      });

      expect(denialReason(await check(tooPrecise))).toContain(
        "weight_recommended: At most 2 decimals"
      );

      const fractionalReps = pushWith({
        sets: [benchSet({ reps_recommended: 8.5 })],
      });

      expect(denialReason(await check(fractionalReps))).toContain(
        "reps_recommended"
      );

      expect(
        denialReason(
          await check({
            details: { frequency: 9 },
            plan_id: PLAN_ID,
            plan_version: VERSION,
          })
        )
      ).toContain("details.frequency");

      expect(proposals.savePlanProposal).not.toHaveBeenCalled();
    });

    it("refuses a proposal that would leave too many Workouts or none", async () => {
      plans.getPlan.mockResolvedValue({
        ...plan,
        workouts: [PUSH],
      });

      const none = denialReason(
        await check({
          plan_id: PLAN_ID,
          plan_version: planVersion({ ...plan, workouts: [PUSH] }),
          removed_workout_ids: [PUSH_ID],
        })
      );

      expect(none).toContain("without a workout");

      const full = {
        ...plan,
        workouts: Array.from({ length: 14 }, () => LEGS),
      };

      plans.getPlan.mockResolvedValue(full);

      const tooMany = denialReason(
        await check({ ...newPull(), plan_version: planVersion(full) })
      );

      expect(tooMany).toContain("at most 14");
    });

    it("refuses a stale version marker, sending Arnold to read the Plan again", async () => {
      const reason = denialReason(
        await check({ ...heavierPush(), plan_version: "an-older-marker" })
      );

      expect(reason).toBe(PLAN_CHANGED);
      expect(reason).toContain("get_plan");
    });

    it("refuses a proposal that changes nothing", async () => {
      expect(
        denialReason(await check({ plan_id: PLAN_ID, plan_version: VERSION }))
      ).toContain("changes nothing");

      const sameAsRead = pushWith({
        sets: [
          benchSet({ id: BENCH_SET_1, weight_recommended: 60 }),
          benchSet({ id: BENCH_SET_2, weight_recommended: 60 }),
        ],
      });

      expect(denialReason(await check(sameAsRead))).toContain(
        "changes nothing"
      );

      // An empty note on a Plan without one is no note either
      expect(
        denialReason(
          await check({
            details: { note: "" },
            plan_id: PLAN_ID,
            plan_version: VERSION,
          })
        )
      ).toContain("changes nothing");

      expect(
        denialReason(
          await check({
            details: { name: "Strength", place: "gym" },
            plan_id: PLAN_ID,
            plan_version: VERSION,
          })
        )
      ).toContain("changes nothing");
    });

    it("refuses a second proposal of the same model response", async () => {
      const tool = freshTool();

      await expect(
        check(heavierPush(), { callId: "call_1" }, tool)
      ).resolves.toBe("user-approval");

      expect(
        denialReason(await check(newPull(), { callId: "call_2" }, tool))
      ).toBe(proposePlan.ONE_PROPOSAL_PER_STEP);

      // eve checks the held one again when the User accepts it
      await expect(
        check(heavierPush(), { callId: "call_1" }, tool)
      ).resolves.toBe("user-approval");

      // The next model call gets a fresh copy, so it can propose again
      await expect(check(newPull(), { callId: "call_3" })).resolves.toBe(
        "user-approval"
      );
    });

    it("lets a corrected proposal follow a refused one in the same response", async () => {
      const tool = freshTool();

      denialReason(
        await check(
          { ...heavierPush(), plan_version: "an-older-marker" },
          { callId: "call_1" },
          tool
        )
      );

      await expect(
        check(heavierPush(), { callId: "call_2" }, tool)
      ).resolves.toBe("user-approval");
    });

    it("refuses two proposals checked at once, holding only the first", async () => {
      const tool = freshTool();

      const [first, second] = await Promise.all([
        check(heavierPush(), { callId: "call_1" }, tool),
        check(newPull(), { callId: "call_2" }, tool),
      ]);

      expect(first).toBe("user-approval");
      expect(denialReason(second)).toBe(proposePlan.ONE_PROPOSAL_PER_STEP);
    });

    it("refuses a Plan that isn't the User's", async () => {
      plans.getPlan.mockResolvedValue(null);

      expect(denialReason(await check(heavierPush()))).toContain("get_plans");
    });

    it("refuses a turn whose caller isn't the Conversation's owner", async () => {
      const reason = denialReason(
        await check(heavierPush(), {
          ctx: contextFor("user_alice", "user_mallory"),
        })
      );

      expect(reason).toContain("owner");
      expect(db.asUser).not.toHaveBeenCalled();
    });

    it("refuses with a retry reason when the Library can't load", async () => {
      testLibrary.reset({ loads: "fail" });

      const reason = denialReason(await check(newPull()));

      expect(reason).toContain("Try again in a moment");

      // A change bringing in no slug needs no Library
      await expect(check(heavierPush())).resolves.toBe("user-approval");
      expect(proposals.savePlanProposal).not.toHaveBeenCalled();
    });

    it("refuses a new Workout with a retry reason when the index can't load", async () => {
      testLibraryIndex.reset({ loads: "fail" });

      expect(denialReason(await check(newPull()))).toContain(
        "Try again in a moment"
      );

      // A change to kept Workouts needs no Cover
      await expect(check(heavierPush())).resolves.toBe("user-approval");
    });
  });

  describe("execute", () => {
    it("saves once as the owner and answers the Plan's id and the counts", async () => {
      const input = heavierPush();

      await expect(freshTool().execute(input, alice)).resolves.toStrictEqual({
        changes: {
          exercises_added: 0,
          exercises_removed: 0,
          sets_added: 1,
          sets_changed: 2,
          sets_removed: 0,
          workouts_added: 0,
          workouts_changed: 1,
          workouts_removed: 0,
        },
        plan_id: PLAN_ID,
      });

      expect(db.asUser).toHaveBeenCalledExactlyOnceWith(
        "user_alice",
        expect.any(Function)
      );
      expect(proposals.savePlanProposal).toHaveBeenCalledExactlyOnceWith(
        tx,
        "user_alice",
        PLAN_ID,
        {
          details: undefined,
          planVersion: VERSION,
          removedWorkoutIds: undefined,
          workouts: input.workouts,
        },
        { coverNewWorkouts: expect.any(Function) }
      );
    });

    it("gives new Workouts Covers, counting the kept ones' as used", async () => {
      await freshTool().execute(newPull(), alice);

      const pick =
        proposals.savePlanProposal.mock.calls[0]?.[4]?.coverNewWorkouts;

      if (pick === undefined) {
        throw new Error("Expected the save to pick new Workouts' Covers");
      }

      const [cover] = pick(
        [
          {
            description: "",
            exercises: [{ exercise_slug: "bench-press", sets: [] }],
            name: "Pull",
          },
        ],
        [CHEST_COVERS[0]]
      );

      // The other chest Cover, since the kept Push holds the first
      expect(cover).toBe(CHEST_COVERS[1]);
    });

    it("saves a change adding no Workout while the Library and index can't load", async () => {
      testLibrary.reset({ loads: "fail" });
      testLibraryIndex.reset({ loads: "fail" });

      await expect(
        freshTool().execute(
          {
            details: { frequency: 3 },
            plan_id: PLAN_ID,
            plan_version: VERSION,
          },
          alice
        )
      ).resolves.toMatchObject({ plan_id: PLAN_ID });

      expect(proposals.savePlanProposal).toHaveBeenCalledOnce();
    });

    it("saves an empty note as no note", async () => {
      await freshTool().execute(
        { details: { note: "" }, plan_id: PLAN_ID, plan_version: VERSION },
        alice
      );

      expect(
        proposals.savePlanProposal.mock.calls[0]?.[3].details
      ).toStrictEqual({
        note: null,
      });
    });

    it("fails with the reason when the Plan changed since it was read", async () => {
      proposals.savePlanProposal.mockResolvedValue({ status: "plan_changed" });

      await expect(freshTool().execute(heavierPush(), alice)).rejects.toThrow(
        PLAN_CHANGED
      );
    });

    it("fails with a retry reason, writing nothing, when the index can't load", async () => {
      testLibraryIndex.reset({ loads: "fail" });

      await expect(freshTool().execute(newPull(), alice)).rejects.toThrow(
        "Try again in a moment"
      );

      expect(db.asUser).not.toHaveBeenCalled();
      expect(proposals.savePlanProposal).not.toHaveBeenCalled();
    });

    it("fails, naming them, when the save finds ids that aren't the Plan's", async () => {
      proposals.savePlanProposal.mockResolvedValue({
        ids: [BENCH_SET_1],
        status: "invalid_ids",
      });

      await expect(freshTool().execute(heavierPush(), alice)).rejects.toThrow(
        BENCH_SET_1
      );
    });

    it("fails for a Plan gone since the check", async () => {
      proposals.savePlanProposal.mockResolvedValue({ status: "not_found" });

      await expect(freshTool().execute(heavierPush(), alice)).rejects.toThrow(
        "Nothing was saved"
      );
    });

    it("takes no User id from its input", () => {
      const parsed = inputSchemaOf(freshTool()).parse({
        ...heavierPush(),
        ...userIdFields,
      });

      expect(parsed).toStrictEqual(heavierPush());
    });
  });
});
