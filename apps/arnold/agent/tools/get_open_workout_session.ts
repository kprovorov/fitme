import { asUser } from "@fitme/db";
import { listExerciseNotes } from "@fitme/services/exercise-notes";
import {
  getWorkoutSession,
  listWorkoutSessions,
} from "@fitme/services/workout-sessions";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { appLanguage } from "../lib/client-context";
import { withExerciseDetails } from "../lib/exercises";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Get the workout session the user has open right now (started, not finished yet), with its workout, exercises and sets: each set's id, logged values, targets and note (null for none), and each exercise with the user's exercise note (exercise_note, null for none). Changes nothing. Use this for anything about the workout they are doing now.",
  async execute(_input, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);

    const { notes, session } = await asUser(userId, async (tx) => {
      // A User has at most one open Workout Session (ADR 0013).
      const {
        sessions: [open],
      } = await listWorkoutSessions(tx, {
        limit: 1,
        offset: 0,
        status: "in_progress",
      });

      const detail = open ? await getWorkoutSession(tx, open.id) : null;

      return {
        notes: detail ? await listExerciseNotes(tx, userId) : [],
        session: detail,
      };
    });

    // Finished or discarded between the two reads (READ COMMITTED) is not open.
    if (session?.status !== "in_progress") {
      return { error: "No workout session is open" };
    }

    const [exercises] = await withExerciseDetails(
      [session.exercises],
      appLanguage(ctx.messages),
      notes
    );

    return { ...session, exercises };
  },
  inputSchema: z.object({}),
});
