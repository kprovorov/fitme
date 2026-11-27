import { MAX_REPS, MAX_WEIGHT } from "@fitme/core/limits";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ToolContext } from "../context.js";
import {
  asJson,
  READ_ONLY,
  requireFound,
  ToolError,
  WEIGHT_UNIT_NOTE,
  withServices,
} from "./helpers.js";
import { EXERCISE_NOTE_NOTE, namedSession } from "./library.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./limits.js";

const sessionIdSchema = z
  .guid()
  .describe("Workout session id (workout_sessions.id).");

const sessionSetIdSchema = z
  .guid()
  .describe(
    "Session set id (workout_session_exercise_sets.id) from get_workout_session or start_workout_session — not a plan set id."
  );

const sessionNotFound = (sessionId: string) =>
  `Workout session ${sessionId} not found (it may have been deleted or belong to another user).`;

const setNotFound = (setId: string) =>
  `Set ${setId} not found. Use the set ids from get_workout_session (workout_session_exercise_sets.id).`;

const workoutNotFound = (workoutId: string) =>
  `Workout ${workoutId} not found (its plan may have been deleted or belong to another user, or update_plan replaced it — get_plan returns the current workout ids).`;

const registerSessionReadTools = (server: McpServer, ctx: ToolContext) => {
  server.registerTool(
    "get_workout_session",
    {
      annotations: READ_ONLY,
      description: `Returns a workout session with its workout and plan (id, name), and its exercises in order, each with the Exercise's \`exercise_slug\`, \`name\` and \`muscle_groups\` from the Library and its sets in order. Each set's \`id\` is the \`setId\` that log_set and remove_set_from_workout_session need; its \`order\` can have gaps where sets were removed, so count sets by position; \`reps_completed\` / \`weight_completed\` / \`logged_at\` are null until the set is logged. ${EXERCISE_NOTE_NOTE} ${WEIGHT_UNIT_NOTE}`,
      inputSchema: { sessionId: sessionIdSchema },
      title: "Get workout session",
    },
    withServices(ctx, async ({ sessionId }, services) => {
      const { exerciseNotes, value } =
        await services.getWorkoutSession(sessionId);

      return asJson(
        await namedSession(
          ctx,
          requireFound(value, sessionNotFound(sessionId)),
          exerciseNotes
        )
      );
    })
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
};

const sessionInProgress = ({
  sessionId,
  workoutName,
}: {
  sessionId: string;
  workoutName: string | null;
}) => {
  const open =
    workoutName === null
      ? `Workout session ${sessionId} is already in progress`
      : `Workout "${workoutName}" is already in progress (session ${sessionId})`;

  return `${open}: a user has at most one open workout session. Finish it with finish_workout_session (or delete_workout_session) before starting another.`;
};

const registerSessionWriteTools = (server: McpServer, ctx: ToolContext) => {
  server.registerTool(
    "start_workout_session",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: `Starts a workout session from one of the user's plan workouts (ids from get_plan / list_plans): the workout's exercises and recommended sets are copied into the session. A user has at most one unfinished session: if it's this workout's, that session is returned instead (\`resumed: true\`); if it's another workout's, the start fails naming that workout, and nothing is written (finish or delete it first). Returns \`{ resumed, session }\`, the session as get_workout_session shows it; its set ids are what log_set and remove_set_from_workout_session need. Call finish_workout_session when done. ${EXERCISE_NOTE_NOTE}`,
      inputSchema: {
        workoutId: z
          .guid()
          .describe("Plan workout id (workouts.id), e.g. from get_plan."),
      },
      title: "Start workout session",
    },
    withServices(ctx, async ({ workoutId }, services) => {
      const { exerciseNotes, value: result } =
        await services.startWorkoutSession(workoutId);

      if (result.status === "not_found") {
        throw new ToolError(workoutNotFound(workoutId));
      }

      if (result.status === "session_in_progress") {
        throw new ToolError(sessionInProgress(result));
      }

      const { resumed, session } = result;

      return asJson({
        resumed,
        session: await namedSession(ctx, session, exerciseNotes),
      });
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
        setId: sessionSetIdSchema,
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
        throw new ToolError(setNotFound(input.setId));
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
    "remove_set_from_workout_session",
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Permanently removes one set, logged or not, from an open (in-progress) workout session; a finished session can't be changed. This cannot be undone; removing an unknown or already removed set is an error. The plan isn't changed, but after the session is finished the app can offer to remove the set from the plan too. The other sets keep their ids and their `order`, so a removed set leaves a gap in `order`: count sets by position.",
      inputSchema: { setId: sessionSetIdSchema },
      title: "Remove set from workout session",
    },
    withServices(ctx, async ({ setId }, services) => {
      const result = await services.removeSetFromWorkoutSession(setId);

      if (result.status === "not_found") {
        throw new ToolError(setNotFound(setId));
      }

      if (result.status === "session_finished") {
        throw new ToolError(
          `Workout session ${result.sessionId} was finished at ${result.finishedAt}; its sets can no longer be removed.`
        );
      }

      return asJson({ removed: true, setId });
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
      description: `Marks an in-progress workout session as finished and moves its workout to the end of the plan's rotation, so the next workout comes up (\`rotated: true\`). Rotation is skipped (\`rotated: false\`) when the session's workout no longer exists, e.g. after update_plan replaced the workouts. Calling it on an already finished session changes nothing (\`alreadyFinished: true\`). Returns \`{ alreadyFinished, rotated, session }\`, the session as get_workout_session shows it. ${EXERCISE_NOTE_NOTE}`,
      inputSchema: { sessionId: sessionIdSchema },
      title: "Finish workout session",
    },
    withServices(ctx, async ({ sessionId }, services) => {
      const { exerciseNotes, value: result } =
        await services.finishWorkoutSession(sessionId);

      if (result.status === "not_found") {
        throw new ToolError(sessionNotFound(sessionId));
      }

      const { alreadyFinished, rotated, session } = result;

      return asJson({
        alreadyFinished,
        rotated,
        session: await namedSession(ctx, session, exerciseNotes),
      });
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
};

export const registerSessionTools = (server: McpServer, ctx: ToolContext) => {
  registerSessionReadTools(server, ctx);
  registerSessionWriteTools(server, ctx);
};
