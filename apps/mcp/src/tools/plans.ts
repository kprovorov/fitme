import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "../context.js";
import type { FitmeSupabaseClient } from "../supabase.js";
import {
  asJson,
  byOrder,
  nowIso,
  pickDefined,
  READ_ONLY,
  readBack,
  requireFound,
  ToolError,
  unwrap,
  WEIGHT_UNIT_NOTE,
  withUser,
} from "./helpers.js";
import {
  collectExerciseIds,
  planMetadataShape,
  planNoteSchema,
  type WorkoutsInput,
  workoutsSchema,
} from "./plan-schemas.js";

const PLAN_METADATA_COLUMNS =
  "name, description, goal, place, frequency, experience_level, workout_duration, note";

const PLAN_SUMMARY_SELECT = `
  id, name, description, goal, place, frequency, experience_level,
  workout_duration, note, is_active, created_at, updated_at,
  workouts ( id, name, order, exercises:workout_exercises ( id ) )
`;

const PLAN_DETAIL_SELECT = `
  id, name, description, goal, place, frequency, experience_level,
  workout_duration, note, is_active, created_at, updated_at,
  workouts (
    id, name, description, order,
    exercises:workout_exercises (
      id, order,
      exercise:exercises ( id, name, muscle_groups ),
      sets:workout_exercise_sets (
        id, order, reps_recommended, weight_recommended, rest_recommended
      )
    )
  )
`;

/** Keeps the `in (...)` filter comfortably below URL length limits. */
const EXERCISE_ID_BATCH_SIZE = 100;

const planIdSchema = z.string().uuid().describe("Plan id (plans.id).");

const planNotFound = (planId: string) =>
  `Plan ${planId} not found (it may have been deleted or belong to another user).`;

const GET_PLAN_FOLLOW_UP = "get_plan";

interface OrderedWorkout {
  exercises: { order: number; sets: { order: number }[] }[];
  order: number;
}

const sortWorkouts = <W extends OrderedWorkout>(workouts: W[]) =>
  byOrder(workouts).map((workout) => ({
    ...workout,
    exercises: byOrder(workout.exercises).map((exercise) => ({
      ...exercise,
      sets: byOrder(exercise.sets),
    })),
  }));

interface SummaryWorkout {
  exercises: unknown[];
  order: number;
}

/** Plan columns plus workouts in rotation order with an exercise count. */
const toPlanSummary = <P extends { workouts: SummaryWorkout[] }>({
  workouts,
  ...plan
}: P) => ({
  ...plan,
  workouts: byOrder(workouts).map(({ exercises, ...workout }) => ({
    ...workout,
    exercise_count: exercises.length,
  })),
});

async function loadPlan(supabase: FitmeSupabaseClient, planId: string) {
  const plan = requireFound(
    unwrap(
      await supabase
        .from("plans")
        .select(PLAN_DETAIL_SELECT)
        .eq("id", planId)
        .is("deleted_at", null)
        .maybeSingle()
    ),
    planNotFound(planId)
  );
  return { ...plan, workouts: sortWorkouts(plan.workouts) };
}

async function loadPlanSummary(supabase: FitmeSupabaseClient, planId: string) {
  const plan = requireFound(
    unwrap(
      await supabase
        .from("plans")
        .select(PLAN_SUMMARY_SELECT)
        .eq("id", planId)
        .is("deleted_at", null)
        .maybeSingle()
    ),
    planNotFound(planId)
  );
  return toPlanSummary(plan);
}

const chunk = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  );

/**
 * Fails with a readable list of unknown ids; otherwise the plan RPCs would
 * abort with an opaque foreign-key violation.
 */
async function assertExercisesExist(
  supabase: FitmeSupabaseClient,
  workouts: WorkoutsInput
) {
  const ids = collectExerciseIds(workouts);
  const batches = await Promise.all(
    chunk(ids, EXERCISE_ID_BATCH_SIZE).map(async (batch) =>
      unwrap(await supabase.from("exercises").select("id").in("id", batch))
    )
  );
  const known = new Set(batches.flat().map((row) => row.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new ToolError(
      `Unknown exercise_id(s): ${unknown.join(", ")}. Use list_exercises to look up valid exercise ids.`
    );
  }
}

/** Throws unless the plan exists, belongs to the caller and isn't deleted. */
async function assertPlanIsLive(supabase: FitmeSupabaseClient, planId: string) {
  requireFound(
    unwrap(
      await supabase
        .from("plans")
        .select("id")
        .eq("id", planId)
        .is("deleted_at", null)
        .maybeSingle()
    ),
    planNotFound(planId)
  );
}

type PlanMetadataUpdate = Partial<{
  description: string;
  experience_level: string;
  frequency: number;
  goal: string;
  name: string;
  note: string | null;
  place: string;
  workout_duration: number;
}>;

async function updatePlanMetadata(
  supabase: FitmeSupabaseClient,
  planId: string,
  metadata: PlanMetadataUpdate
) {
  const rows = unwrap(
    await supabase
      .from("plans")
      .update({ ...metadata, updated_at: nowIso() })
      .eq("id", planId)
      .is("deleted_at", null)
      .select("id")
  );
  if (rows.length === 0) {
    throw new ToolError(planNotFound(planId));
  }
}

/**
 * The `update_plan` RPC overwrites every metadata column and recreates all
 * workouts, so the current metadata is merged under the provided fields.
 */
async function replacePlanWorkouts(
  supabase: FitmeSupabaseClient,
  planId: string,
  metadata: PlanMetadataUpdate,
  workouts: WorkoutsInput
) {
  const current = requireFound(
    unwrap(
      await supabase
        .from("plans")
        .select(PLAN_METADATA_COLUMNS)
        .eq("id", planId)
        .is("deleted_at", null)
        .maybeSingle()
    ),
    planNotFound(planId)
  );
  await assertExercisesExist(supabase, workouts);
  unwrap(
    await supabase.rpc("update_plan", {
      p_plan_data: { ...current, ...metadata, workouts },
      p_plan_id: planId,
    })
  );
}

/**
 * Soft-deletes a live plan. A plan that is already soft-deleted is reported
 * as such (so a retry is a no-op); an unknown id is an error.
 */
async function softDeletePlan(supabase: FitmeSupabaseClient, planId: string) {
  const now = nowIso();
  const [deleted] = unwrap(
    await supabase
      .from("plans")
      .update({ deleted_at: now, is_active: false, updated_at: now })
      .eq("id", planId)
      .is("deleted_at", null)
      .select("id, name")
  );
  if (deleted) {
    return { alreadyDeleted: false, deleted: true, plan: deleted };
  }

  const existing = unwrap(
    await supabase
      .from("plans")
      .select("id, name, deleted_at")
      .eq("id", planId)
      .maybeSingle()
  );
  if (!existing?.deleted_at) {
    throw new ToolError(planNotFound(planId));
  }
  return {
    alreadyDeleted: true,
    deleted: true,
    plan: { id: existing.id, name: existing.name },
  };
}

function registerPlanReadTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_plans",
    {
      annotations: READ_ONLY,
      description:
        "Lists the authenticated user's training plans, newest first, with a summary of each plan's workouts (id, name, order, exercise count). Workouts are in rotation order: the first one is up next. `is_active` marks the plan the app is following. Use get_plan for exercises and sets.",
      inputSchema: {},
      title: "List plans",
    },
    withUser(ctx, async (_args, { supabase }) => {
      const plans = unwrap(
        await supabase
          .from("plans")
          .select(PLAN_SUMMARY_SELECT)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .order("id")
      );
      return asJson(plans.map(toPlanSummary));
    })
  );

  server.registerTool(
    "get_plan",
    {
      annotations: READ_ONLY,
      description: `Returns one of the user's plans in full: workouts in rotation order (first = next up), each with its exercises (workout_exercises.id, the library exercise id/name/muscle groups) and recommended sets. Workout ids are what start_workout_session needs. ${WEIGHT_UNIT_NOTE}`,
      inputSchema: { planId: planIdSchema },
      title: "Get plan",
    },
    withUser(ctx, async ({ planId }, { supabase }) =>
      asJson(await loadPlan(supabase, planId))
    )
  );
}

function registerPlanWriteTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "create_plan",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: `Creates a training plan for the user and makes it their ACTIVE plan (every other plan is deactivated). Look up exercise ids with list_exercises first; unknown ids are rejected. Order of workouts, exercises and sets comes from their array position. Use list_plan_options for valid goal / place / experience_level values. ${WEIGHT_UNIT_NOTE} Returns the created plan in full (or its id and a \`warning\` if it was saved but couldn't be read back — don't create it again).`,
      inputSchema: {
        ...planMetadataShape,
        note: planNoteSchema.optional(),
        workouts: workoutsSchema,
      },
      title: "Create plan",
    },
    withUser(ctx, async (plan, { supabase }) => {
      await assertExercisesExist(supabase, plan.workouts);
      const planId = unwrap(
        await supabase.rpc("create_plan", { p_plan_data: plan })
      );
      return readBack(
        () => loadPlan(supabase, planId),
        { created: true, planId },
        GET_PLAN_FOLLOW_UP
      );
    })
  );

  server.registerTool(
    "update_plan",
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: `Updates one of the user's plans. Pass only the fields to change. Without \`workouts\`, only the given metadata fields are updated and workout ids stay the same. With \`workouts\`, ALL existing workouts are deleted and recreated from the array (send the complete list, not a diff): workout / exercise / set ids change, and past workout sessions keep their logged sets but lose the link to their workout. Does not change which plan is active. ${WEIGHT_UNIT_NOTE} Returns the updated plan in full.`,
      inputSchema: {
        description: planMetadataShape.description.optional(),
        experience_level: planMetadataShape.experience_level.optional(),
        frequency: planMetadataShape.frequency.optional(),
        goal: planMetadataShape.goal.optional(),
        name: planMetadataShape.name.optional(),
        note: planNoteSchema
          .nullable()
          .optional()
          .describe("Free-form note; null clears it."),
        place: planMetadataShape.place.optional(),
        planId: planIdSchema,
        workout_duration: planMetadataShape.workout_duration.optional(),
        workouts: workoutsSchema.optional(),
      },
      title: "Update plan",
    },
    withUser(ctx, async ({ planId, workouts, ...fields }, { supabase }) => {
      const metadata = pickDefined(fields);
      if (!workouts && Object.keys(metadata).length === 0) {
        throw new ToolError(
          "Nothing to update: pass at least one plan field or `workouts`."
        );
      }
      if (workouts) {
        await replacePlanWorkouts(supabase, planId, metadata, workouts);
      } else {
        await updatePlanMetadata(supabase, planId, metadata);
      }
      return readBack(
        () => loadPlan(supabase, planId),
        { planId, updated: true },
        GET_PLAN_FOLLOW_UP
      );
    })
  );

  server.registerTool(
    "delete_plan",
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Deletes one of the user's plans (soft delete, like the app: it disappears from list_plans/get_plan and is deactivated; logged workout history is kept). Deleting an already deleted plan is a no-op (`alreadyDeleted: true`).",
      inputSchema: { planId: planIdSchema },
      title: "Delete plan",
    },
    withUser(ctx, async ({ planId }, { supabase }) =>
      asJson(await softDeletePlan(supabase, planId))
    )
  );

  server.registerTool(
    "activate_plan",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Makes one of the user's plans the active plan (the one the app follows); every other plan is deactivated. Returns the plan summary (same shape as list_plans).",
      inputSchema: { planId: planIdSchema },
      title: "Activate plan",
    },
    withUser(ctx, async ({ planId }, { supabase }) => {
      // The RPC only checks ownership, so guard against soft-deleted plans.
      await assertPlanIsLive(supabase, planId);
      unwrap(await supabase.rpc("activate_plan", { plan_id: planId }));
      return readBack(
        async () => ({
          activated: true,
          plan: await loadPlanSummary(supabase, planId),
        }),
        { activated: true, planId },
        GET_PLAN_FOLLOW_UP
      );
    })
  );
}

export function registerPlanTools(server: McpServer, ctx: ToolContext) {
  registerPlanReadTools(server, ctx);
  registerPlanWriteTools(server, ctx);
}
