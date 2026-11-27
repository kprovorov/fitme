import type { ThreadMessage } from "@assistant-ui/react-native";
import type { QueryKey } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useExerciseNotesQuery } from "~/hooks/queries/exercise-notes";
import { EXERCISE_HISTORY_QUERY_KEY } from "~/hooks/queries/exercises";
import {
  OPEN_WORKOUT_SESSION_QUERY_KEY,
  WORKOUT_SESSION_QUERY_KEY,
} from "~/hooks/queries/workout-sessions";
import { arnoldEdits } from "~/lib/arnold-chat";
import type { ArnoldEditTool } from "~/lib/arnold-chat";

/**
 * The reads each Arnold edit makes stale. A set removed changes the open
 * Workout Session and, since it may have been logged, Exercise history; an
 * Exercise note changes the notes list; a set's note changes the Workout
 * Session that holds the set (open or finished) and Exercise history, whose
 * sets carry their notes.
 */
const READS_CHANGED_BY: Record<ArnoldEditTool, readonly QueryKey[]> = {
  remove_set_from_workout_session: [
    WORKOUT_SESSION_QUERY_KEY,
    OPEN_WORKOUT_SESSION_QUERY_KEY,
    EXERCISE_HISTORY_QUERY_KEY,
  ],
  set_exercise_note: [useExerciseNotesQuery.getKey()],
  set_workout_session_set_note: [
    WORKOUT_SESSION_QUERY_KEY,
    EXERCISE_HISTORY_QUERY_KEY,
  ],
};

/**
 * Reads again what Arnold changed (`ARNOLD_EDIT_TOOLS`: a set removed from
 * the open Workout Session, an Exercise note, a set's note), so the User sees
 * it when they're back on the screen showing it. The reads are made stale
 * rather than refetched: a mounted screen reads again at once, and the next
 * one to open does too. A note editor that's open keeps its unsaved text,
 * since the draft is the editor's own.
 *
 * Each result counts once, by its tool call's id. What the Conversation
 * already holds when the screen opens (a reopened one's saved results)
 * counted when it arrived and reads nothing again; any other result does,
 * once, however many streamed chunks re-render the message after it. That
 * includes one a resume brings back past the saved log, which may have
 * landed while no screen was watching: one read too many is harmless, a
 * stale set or note still showing isn't.
 */
export const useArnoldEdits = (messages: readonly ThreadMessage[]) => {
  const queryClient = useQueryClient();
  // Seeded with the Conversation the screen opened on, never re-read.
  const counted = useRef<Set<string> | null>(null);

  useEffect(() => {
    const edits = arnoldEdits(messages);

    if (!counted.current) {
      counted.current = new Set(edits.map((edit) => edit.toolCallId));

      return;
    }

    const seen = counted.current;
    const stale = new Set<QueryKey>();

    for (const edit of edits) {
      if (seen.has(edit.toolCallId)) {
        continue;
      }

      seen.add(edit.toolCallId);

      for (const queryKey of READS_CHANGED_BY[edit.tool]) {
        stale.add(queryKey);
      }
    }

    for (const queryKey of stale) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [messages, queryClient]);
};
