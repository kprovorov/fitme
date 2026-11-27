import { ApiError } from "@fitme/api-client";
import type { InvalidateQueryFilters } from "@tanstack/react-query";
import { createMutation } from "react-query-kit";

import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import type {
  WorkoutSession,
  WorkoutSessionSet,
} from "~/hooks/queries/workout-sessions";
import { analytics } from "~/lib/analytics";
import { publicApi } from "~/lib/public-api";
import {
  isStillWriteStarter,
  rememberWriteStarter,
  seedWriteAnswer,
} from "~/lib/write-answers";
import type { WriteStarter } from "~/lib/write-answers";

export interface SaveWorkoutSessionSetNoteData {
  /** The whole text as the User left it; blank clears the note. */
  note: string;
  /** The Workout Session the set is in, whose read shows the answer. */
  sessionId: string;
  setId: string;
}

/** Saving a set's note, whichever screen's row runs it. */
export const SAVE_SET_NOTE_MUTATION_KEY = ["workout-session-set", "note"];

/**
 * The Workout Session with the saved set's note in place, and nothing else
 * of the answer: its reps and weight are the read's to show. `null` when the
 * read doesn't hold the set (one added on the phone it hasn't read yet).
 */
export const withSavedSetNote = (
  session: WorkoutSession,
  saved: WorkoutSessionSet
): WorkoutSession | null => {
  const holdsSet = session.exercises.some(({ sets }) =>
    sets.some(({ id }) => id === saved.id)
  );

  if (!holdsSet) {
    return null;
  }

  return {
    ...session,
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) =>
        set.id === saved.id ? { ...set, note: saved.note } : set
      ),
    })),
  };
};

const saveWorkoutSessionSetNote = async ({
  note,
  setId,
}: SaveWorkoutSessionSetNoteData): Promise<WorkoutSessionSet> => {
  const { data } = await publicApi().PUT("/v1/workout-session-sets/{id}/note", {
    body: { note },
    params: { path: { id: setId } },
  });

  if (!data) {
    throw new ApiError("Public API answered without the set");
  }

  return data.data;
};

/**
 * Saves the User's note on a logged set through
 * `PUT /v1/workout-session-sets/{id}/note` (no expected note: the last save
 * wins). It logs nothing: no rest timer, finish suggestion, haptic or
 * `Set Tracked`, and the set's reps, weight and log time stay. The answer
 * shows in the Workout Session's read by the write-answer rules
 * (`seedWriteAnswer`): as is while the read still shows what it showed when
 * the save started, read again otherwise (or when the read doesn't hold the
 * set), and nothing at all once another User is signed in. Exercise history,
 * which carries set notes too, is read again. `Note Saved` or `Note Cleared`
 * goes out once the API has answered, with the target only, never the text.
 * Seeded in the mutation's own `onMutate` and `onSuccess` (a hook-level one
 * would replace them), so a row passes its own to `mutate`.
 */
export const useSaveWorkoutSessionSetNoteMutation = createMutation<
  WorkoutSessionSet,
  SaveWorkoutSessionSetNoteData,
  Error,
  WriteStarter
>({
  mutationFn: saveWorkoutSessionSetNote,
  mutationKey: SAVE_SET_NOTE_MUTATION_KEY,
  onMutate: ({ sessionId }, { client }) =>
    rememberWriteStarter(client, [
      useWorkoutSessionQuery.getKey({ sessionId }),
    ]),
  onSuccess: async (saved, { sessionId }, starter, { client }) => {
    if (!isStillWriteStarter(starter)) {
      return;
    }

    const queryKey = useWorkoutSessionQuery.getKey({ sessionId });
    const shown = client.getQueryData<WorkoutSession>(queryKey);
    const answer = shown ? withSavedSetNote(shown, saved) : null;

    const alsoInvalidate: InvalidateQueryFilters[] = [
      { queryKey: ["exercise-history"] },
    ];

    // A read without the set can't take the answer: it's read again.
    await (answer
      ? seedWriteAnswer(client, starter, { alsoInvalidate, answer, queryKey })
      : Promise.all([
          client.invalidateQueries({ exact: true, queryKey }),
          ...alsoInvalidate.map((filters) => client.invalidateQueries(filters)),
        ]));

    // Not awaited: the save has landed whatever the analytics client does.
    if (isStillWriteStarter(starter)) {
      void analytics.send(saved.note === null ? "Note Cleared" : "Note Saved", {
        target: "set",
      });
    }
  },
});
