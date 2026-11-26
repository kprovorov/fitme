import type { ThreadMessage } from "@assistant-ui/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { EXERCISE_HISTORY_QUERY_KEY } from "~/hooks/queries/exercises";
import {
  OPEN_WORKOUT_SESSION_QUERY_KEY,
  WORKOUT_SESSION_QUERY_KEY,
} from "~/hooks/queries/workout-sessions";
import { removedSetCallIds } from "~/lib/arnold-chat";

/**
 * Reads the open Workout Session again once Arnold has removed a set from it
 * (`remove_set_from_workout_session`), so the User sees the set gone when
 * they're back on it. Its reads are made stale rather than refetched: a
 * mounted screen reads again at once, and the next one to open does too.
 * Exercise history goes with them, since the set removed may have been a
 * logged one.
 *
 * Each result counts once, by its tool call's id. What the Conversation
 * already holds when the screen opens (a reopened one's saved results)
 * counted when it arrived and reads nothing again; any other result does,
 * once, however many streamed chunks re-render the message after it. That
 * includes one a resume brings back past the saved log, which may have
 * landed while no screen was watching: one read too many is harmless, a
 * removed set still showing isn't.
 */
export const useArnoldWorkoutSessionEdits = (
  messages: readonly ThreadMessage[]
) => {
  const queryClient = useQueryClient();
  // Seeded with the Conversation the screen opened on, never re-read.
  const counted = useRef<Set<string> | null>(null);

  useEffect(() => {
    const ids = removedSetCallIds(messages);

    if (!counted.current) {
      counted.current = new Set(ids);

      return;
    }

    const seen = counted.current;
    const fresh = ids.filter((id) => !seen.has(id));

    for (const id of fresh) {
      seen.add(id);
    }

    if (fresh.length === 0) {
      return;
    }

    for (const queryKey of [
      WORKOUT_SESSION_QUERY_KEY,
      OPEN_WORKOUT_SESSION_QUERY_KEY,
      EXERCISE_HISTORY_QUERY_KEY,
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [messages, queryClient]);
};
