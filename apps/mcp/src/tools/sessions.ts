import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "../context.js";
import type { FitmeSupabaseClient } from "../supabase.js";
import {
  asJson,
  byOrder,
  nowIso,
  READ_ONLY,
  readBack,
  requireFound,
  ToolError,
  unwrap,
  WEIGHT_UNIT_NOTE,
  withServices,
  withUser,
} from "./helpers.js";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_REPS,
  MAX_WEIGHT,
} from "./limits.js";

const SESSION_DETAIL_SELECT = `
  id, started_at, finished_at,
  workout:workouts ( id, name ),
  plan:plans ( id, name ),
  exercises:workout_session_exercises (
    id, order,
    exercise:exercises ( id, name ),
    sets:workout_session_exercise_sets (
      id, order, reps_recommended, weight_recommended, rest_recommended,
      reps_completed, weight_completed, logged_at
    )
  )
`;

const SESSION_STATE_SELECT = "id, finished_at, workout_id";

const GET_SESSION_FOLLOW_UP = "get_workout_session";

const sessionIdSchema = z
  .string()
  .uuid()
  .describe("Workout session id (workout_sessions.id).");

const sessionNotFound = (sessionId: string) =>
  `Workout session ${sessionId} not found (it may have been deleted or belong to another user).`;

const workoutNotFound = (workoutId: string) =>
  `Workout ${workoutId} not found (its plan may have been deleted or belong to another user, or update_plan replaced it — get_plan returns the current workout ids).`;

const statusOf = (finishedAt: string | null) =>
  finishedAt ? "finished" : "in_progress";

async function loadSession(supabase: FitmeSupabaseClient, sessionId: string) {
  const session = requireFound(
    unwrap(
      await supabase
        .from("workout_sessions")
        .select(SESSION_DETAIL_SELECT)
        .eq("id", sessionId)
        .maybeSingle()
    ),
    sessionNotFound(sessionId)
  );
  return {
    ...session,
    exercises: byOrder(session.exercises).map((exercise) => ({
      ...exercise,
      sets: byOrder(exercise.sets),
    })),
    status: statusOf(session.finished_at),
  };
}

async function loadSessionState(
  supabase: FitmeSupabaseClient,
  sessionId: string
) {
  return requireFound(
    unwrap(
      await supabase
        .from("workout_sessions")
        .select(SESSION_STATE_SELECT)
        .eq("id", sessionId)
        .maybeSingle()
    ),
    sessionNotFound(sessionId)
  );
}

/** The RPC doesn't look at `deleted_at`, so check the workout's plan here. */
async function assertWorkoutIsLive(
  supabase: FitmeSupabaseClient,
  workoutId: string
) {
  requireFound(
    unwrap(
      await supabase
        .from("workouts")
        .select("id, plan:plans!inner ( id )")
        .eq("id", workoutId)
        .is("plan.deleted_at", null)
        .maybeSingle()
    ),
    workoutNotFound(workoutId)
  );
}

/** The app assumes at most one unfinished session per workout. */
async function findOpenSessionId(
  supabase: FitmeSupabaseClient,
  workoutId: string
) {
  const [open] = unwrap(
    await supabase
      .from("workout_sessions")
      .select("id")
      .eq("workout_id", workoutId)
      .is("finished_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
  );
  return open?.id ?? null;
}

interface FinishOutcome {
  alreadyFinished: boolean;
  rotated: boolean;
}

const ALREADY_FINISHED: FinishOutcome = {
  alreadyFinished: true,
  rotated: false,
};

/** Sets `finished_at` without rotating; true if an open session matched. */
async function finishDirectly(
  supabase: FitmeSupabaseClient,
  sessionId: string
) {
  const rows = unwrap(
    await supabase
      .from("workout_sessions")
      .update({ finished_at: nowIso() })
      .eq("id", sessionId)
      .is("finished_at", null)
      .select("id")
  );
  return rows.length > 0;
}

/**
 * After a failed finish, re-reads the session: it may have been finished
 * concurrently, or its workout removed (then the direct update applies).
 */
async function recoverFinish(
  supabase: FitmeSupabaseClient,
  sessionId: string,
  failure: string
): Promise<FinishOutcome> {
  const state = await loadSessionState(supabase, sessionId);
  if (state.finished_at) {
    return ALREADY_FINISHED;
  }
  if (!state.workout_id && (await finishDirectly(supabase, sessionId))) {
    return { alreadyFinished: false, rotated: false };
  }
  throw new ToolError(failure);
}

/**
 * `finish_workout_session` resolves the plan through the session's workout,
 * so it raises for sessions whose workout was removed by update_plan. Those
 * are only marked finished; there is no workout left to rotate.
 */
async function finishSession(
  supabase: FitmeSupabaseClient,
  sessionId: string
): Promise<FinishOutcome> {
  const state = await loadSessionState(supabase, sessionId);
  if (state.finished_at) {
    return ALREADY_FINISHED;
  }
  if (state.workout_id) {
    const { error } = await supabase.rpc("finish_workout_session", {
      p_session_id: sessionId,
    });
    if (!error) {
      return { alreadyFinished: false, rotated: true };
    }
    return recoverFinish(supabase, sessionId, error.message);
  }
  if (await finishDirectly(supabase, sessionId)) {
    return { alreadyFinished: false, rotated: false };
  }
  return recoverFinish(supabase, sessionId, sessionNotFound(sessionId));
}

function registerSessionReadTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "get_workout_session",
    {
      annotations: READ_ONLY,
      description: `Returns a workout session with its workout and plan (id, name), and its exercises in order, each with the library exercise (id, name) and its sets in order. Each set's \`id\` is the \`setId\` that log_set needs; \`reps_completed\` / \`weight_completed\` / \`logged_at\` are null until the set is logged. ${WEIGHT_UNIT_NOTE}`,
      inputSchema: { sessionId: sessionIdSchema },
      title: "Get workout session",
    },
    withServices(ctx, async ({ sessionId }, services) =>
      asJson(
        requireFound(
          await services.getWorkoutSession(sessionId),
          sessionNotFound(sessionId)
        )
      )
    )
  );

  server.registerTool(
    "list_workout_sessions",
    {
      annotations: READ_ONLY,
      description:
        "Lists the user's workout sessions, newest first, with the workout and plan names and how many sets were logged. Filter by status to find an in-progress session to resume. Returns `total` and `hasMore`; an offset past the end returns an empty page. Use get_workout_session for the sets.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_PAGE_SIZE)
          .default(DEFAULT_PAGE_SIZE)
          .describe(
            `Page size (default ${DEFAULT_PAGE_SIZE}, max ${MAX_PAGE_SIZE}).`
          ),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Number of sessions to skip, for pagination."),
        status: z
          .enum(["all", "in_progress", "finished"])
          .default("all")
          .describe("`in_progress` = not finished yet."),
      },
      title: "List workout sessions",
    },
    withServices(ctx, async ({ limit, offset, status }, services) => {
      const { sessions, total } = await services.listWorkoutSessions({
        limit,
        offset,
        status,
      });
      return asJson({
        hasMore: offset + sessions.length < total,
        limit,
        offset,
        sessions,
        total,
      });
    })
  );
}

function registerSessionWriteTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "start_workout_session",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Starts a workout session from one of the user's plan workouts (ids from get_plan / list_plans): the workout's exercises and recommended sets are copied into the session. If that workout already has an unfinished session, that session is returned instead (`resumed: true`) — there is at most one open session per workout. Returns `{ resumed, session }`; the session's set ids are what log_set needs. Call finish_workout_session when done.",
      inputSchema: {
        workoutId: z
          .string()
          .uuid()
          .describe("Plan workout id (workouts.id), e.g. from get_plan."),
      },
      title: "Start workout session",
    },
    withUser(ctx, async ({ workoutId }, { supabase }) => {
      await assertWorkoutIsLive(supabase, workoutId);
      const openSessionId = await findOpenSessionId(supabase, workoutId);
      if (openSessionId) {
        return asJson({
          resumed: true,
          session: await loadSession(supabase, openSessionId),
        });
      }

      const sessionId = unwrap(
        await supabase.rpc("start_workout_session", {
          p_workout_id: workoutId,
        })
      );
      return readBack(
        async () => ({
          resumed: false,
          session: await loadSession(supabase, sessionId),
        }),
        { resumed: false, sessionId },
        GET_SESSION_FOLLOW_UP
      );
    })
  );

  server.registerTool(
    "log_set",
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: `Records what the user actually did for one set of an in-progress workout session: sets reps_completed, weight_completed and logged_at (now). Logging the same set again overwrites the previous values. ${WEIGHT_UNIT_NOTE} Use 0 for bodyweight exercises.`,
      inputSchema: {
        repsCompleted: z
          .number()
          .int()
          .min(0)
          .max(MAX_REPS)
          .describe("Repetitions performed."),
        setId: z
          .string()
          .uuid()
          .describe(
            "Session set id (workout_session_exercise_sets.id) from get_workout_session or start_workout_session — not a plan set id."
          ),
        weightCompleted: z
          .number()
          .min(0)
          .max(MAX_WEIGHT)
          .describe("Weight used, in the user's unit (kg or lbs)."),
      },
      title: "Log set",
    },
    withServices(ctx, async (input, services) => {
      const result = await services.logSet(input);
      if (result.status === "not_found") {
        throw new ToolError(
          `Set ${input.setId} not found. Use the set ids from get_workout_session (workout_session_exercise_sets.id).`
        );
      }
      if (result.status === "session_finished") {
        throw new ToolError(
          `Workout session ${result.sessionId} was finished at ${result.finishedAt}; its sets can no longer be logged.`
        );
      }
      return asJson(result.set);
    })
  );

  server.registerTool(
    "finish_workout_session",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Marks an in-progress workout session as finished and moves its workout to the end of the plan's rotation, so the next workout comes up (`rotated: true`). Rotation is skipped (`rotated: false`) when the session's workout no longer exists, e.g. after update_plan replaced the workouts. Calling it on an already finished session changes nothing (`alreadyFinished: true`). Returns `{ alreadyFinished, rotated, session }`.",
      inputSchema: { sessionId: sessionIdSchema },
      title: "Finish workout session",
    },
    withUser(ctx, async ({ sessionId }, { supabase }) => {
      const outcome = await finishSession(supabase, sessionId);
      return readBack(
        async () => ({
          ...outcome,
          session: await loadSession(supabase, sessionId),
        }),
        { ...outcome, sessionId },
        GET_SESSION_FOLLOW_UP
      );
    })
  );

  server.registerTool(
    "delete_workout_session",
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Permanently deletes a workout session and all of its logged sets (e.g. to discard a session started by mistake). This cannot be undone; deleting an unknown or already deleted session is an error.",
      inputSchema: { sessionId: sessionIdSchema },
      title: "Delete workout session",
    },
    withServices(ctx, async ({ sessionId }, services) => {
      if (!(await services.deleteWorkoutSession(sessionId))) {
        throw new ToolError(sessionNotFound(sessionId));
      }
      return asJson({ deleted: true, sessionId });
    })
  );
}

export function registerSessionTools(server: McpServer, ctx: ToolContext) {
  registerSessionReadTools(server, ctx);
  registerSessionWriteTools(server, ctx);
}
