import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "../context.js";
import {
  asJson,
  pickDefined,
  READ_ONLY,
  requireFound,
  ToolError,
  WEIGHT_UNIT_NOTE,
  withServices,
} from "./helpers.js";
import {
  lookupForRead,
  namedPlan,
  namePlan,
  requireKnownSlugs,
  workoutSlugs,
} from "./library.js";
import {
  planMetadataShape,
  planNoteSchema,
  workoutsSchema,
} from "./plan-schemas.js";

const planIdSchema = z.guid().describe("Plan id (plans.id).");

/** What a Workout's `cover` is, for every tool showing Workouts. */
const COVER_NOTE =
  "Each workout's `cover` is the id of its Library Cover photo, or null while it has none; it's set by Fitme, never by tool input.";

const planNotFound = (planId: string) =>
  `Plan ${planId} not found (it may have been deleted or belong to another user).`;

function registerPlanReadTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_plans",
    {
      annotations: READ_ONLY,
      description: `Lists the authenticated user's training plans, newest first, with a summary of each plan's workouts (id, name, order, exercise count, cover). Workouts are in rotation order: the first one is up next. \`is_active\` marks the plan the app is following. Use get_plan for exercises and sets. ${COVER_NOTE}`,
      inputSchema: {},
      title: "List plans",
    },
    withServices(ctx, async (_args, services) =>
      asJson(await services.listPlans())
    )
  );

  server.registerTool(
    "get_plan",
    {
      annotations: READ_ONLY,
      description: `Returns one of the user's plans in full: workouts in rotation order (first = next up), each with its exercises (workout_exercises.id, the Exercise's \`exercise_slug\`, \`name\` and \`muscle_groups\` from the Library) and recommended sets. Workout ids are what start_workout_session needs. ${COVER_NOTE} ${WEIGHT_UNIT_NOTE}`,
      inputSchema: { planId: planIdSchema },
      title: "Get plan",
    },
    withServices(ctx, async ({ planId }, services) =>
      asJson(
        await namedPlan(
          ctx,
          requireFound(await services.getPlan(planId), planNotFound(planId))
        )
      )
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
      description: `Creates a training plan for the user and makes it their ACTIVE plan (every other plan is deactivated). Look up Exercise slugs with list_exercises first; unknown slugs are rejected and nothing is saved. Order of workouts, exercises and sets comes from their array position. Use list_plan_options for valid goal / place / experience_level values. ${WEIGHT_UNIT_NOTE} Returns the created plan in full.`,
      inputSchema: {
        ...planMetadataShape,
        note: planNoteSchema.optional(),
        workouts: workoutsSchema,
      },
      title: "Create plan",
    },
    withServices(ctx, async (plan, services) => {
      const known = await requireKnownSlugs(ctx, workoutSlugs(plan.workouts));
      return asJson(namePlan(await services.createPlan(plan), known));
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
      description: `Updates one of the user's plans. Pass only the fields to change. Without \`workouts\`, only the given metadata fields are updated and workout ids stay the same. With \`workouts\`, ALL existing workouts are deleted and recreated from the array (send the complete list, not a diff; unknown Exercise slugs are rejected and nothing is saved): workout / exercise / set ids change, and past workout sessions keep their logged sets but lose the link to their workout. Does not change which plan is active. ${WEIGHT_UNIT_NOTE} Returns the updated plan in full.`,
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
    withServices(ctx, async ({ planId, workouts, ...fields }, services) => {
      const metadata = pickDefined(fields);
      if (!workouts && Object.keys(metadata).length === 0) {
        throw new ToolError(
          "Nothing to update: pass at least one plan field or `workouts`."
        );
      }
      const checked = workouts
        ? await requireKnownSlugs(ctx, workoutSlugs(workouts))
        : undefined;
      const updated = requireFound(
        await services.updatePlan(
          planId,
          workouts ? { ...metadata, workouts } : metadata
        ),
        planNotFound(planId)
      );
      // without workouts, the Plan keeps Exercises nothing has looked up yet
      const known =
        checked ?? (await lookupForRead(ctx, workoutSlugs(updated.workouts)));
      return asJson(namePlan(updated, known));
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
    withServices(ctx, async ({ planId }, services) =>
      asJson(
        requireFound(await services.deletePlan(planId), planNotFound(planId))
      )
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
    withServices(ctx, async ({ planId }, services) =>
      asJson({
        activated: true,
        plan: requireFound(
          await services.activatePlan(planId),
          planNotFound(planId)
        ),
      })
    )
  );
}

export function registerPlanTools(server: McpServer, ctx: ToolContext) {
  registerPlanReadTools(server, ctx);
  registerPlanWriteTools(server, ctx);
}
