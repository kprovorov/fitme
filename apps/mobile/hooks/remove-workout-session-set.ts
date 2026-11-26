import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Keyboard } from "react-native";

import {
  dropAddedSet,
  hideRemovedSet,
  holdOrder,
  markSetRemoved,
  showSetAgain,
} from "~/hooks/added-sets";
import { useDeleteWorkoutSessionSetMutation } from "~/hooks/queries/workout-session-exercise-sets";
import type { SavedWorkoutSessionExerciseSet } from "~/hooks/queries/workout-session-exercise-sets";
import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import type {
  WorkoutSession,
  WorkoutSessionSet,
} from "~/hooks/queries/workout-sessions";
import type { ShownSet } from "~/hooks/shown-sets";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";
import { sessionEditFailureMessage } from "~/lib/session-edit-failure";
import { isStillWriteStarter, rememberWriteStarter } from "~/lib/write-answers";

/** The Workout Session's read without the set. */
const withoutSet = (
  session: WorkoutSession | undefined,
  setId: string
): WorkoutSession | undefined =>
  session && {
    ...session,
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.filter(({ id }) => id !== setId),
    })),
  };

/** The Workout Session's read with the set back in its Exercise, by `order`. */
const withSet = (
  session: WorkoutSession | undefined,
  exerciseId: string,
  set: WorkoutSessionSet
): WorkoutSession | undefined =>
  session && {
    ...session,
    exercises: session.exercises.map((exercise) =>
      exercise.id !== exerciseId ||
      exercise.sets.some(({ id }) => id === set.id)
        ? exercise
        : {
            ...exercise,
            sets: [...exercise.sets, set].toSorted((a, b) => a.order - b.order),
          }
    ),
  };

/**
 * Removes a row of a Workout Session Exercise's sets table. An added set not
 * logged yet only lives on the phone, so it's dropped there: no request, no
 * event. A saved one (a logged one once the User has confirmed, which the row
 * asks) is hidden at once and goes through `DELETE /v1/workout-session-sets/{id}`
 * (a set already gone answers 204 too): it leaves the Workout Session's read,
 * so the stats and Finish count without it, and stays hidden from the rows
 * (`hideRemovedSet`) should a read landing meanwhile still have it. A failure
 * puts it back in its place behind the "Couldn't remove set" alert. The
 * Workout Session is read again either way, since a lost answer may have
 * removed it, and so is Exercise history after a logged set.
 *
 * `logged` is whether the set was logged when the User acted, and `saved` what
 * logging it answered: a set just logged may not be in the read yet, and comes
 * back logged should its removal fail. Nothing happens once the read says the
 * Workout Session has finished (an alert answered after it ended elsewhere),
 * and once the User who removed it has signed out, nothing is shown, alerted,
 * sent or read.
 */
export const useRemoveWorkoutSessionSet = (sessionId: string) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mutateAsync: deleteSet } = useDeleteWorkoutSessionSetMutation();

  return useCallback(
    async (
      exerciseId: string,
      { id, set }: ShownSet,
      logged: boolean,
      saved?: SavedWorkoutSessionExerciseSet
    ) => {
      const queryKey = useWorkoutSessionQuery.getKey({ sessionId });

      if (queryClient.getQueryData<WorkoutSession>(queryKey)?.finished_at) {
        return;
      }

      // A row being edited goes with its unsaved numbers.
      Keyboard.dismiss();

      if (!set) {
        dropAddedSet(exerciseId, id);

        return;
      }

      const starter = rememberWriteStarter(queryClient, []);

      // What comes back on a failure: logged, should the read not have it yet.
      const restored =
        saved?.id === set.id && set.reps_completed === null
          ? { ...set, ...saved }
          : set;

      // Should it come back, no set added meanwhile takes its place.
      holdOrder(exerciseId, set.order);
      hideRemovedSet(exerciseId, set.id);
      queryClient.setQueryData<WorkoutSession>(queryKey, (session) =>
        withoutSet(session, set.id)
      );

      let removed = true;
      let failure: Error | null = null;

      try {
        await deleteSet({ setId: set.id });
      } catch (error) {
        removed = false;
        failure = error instanceof Error ? error : null;
      }

      if (!isStillWriteStarter(starter)) {
        return;
      }

      if (removed) {
        markSetRemoved(set.id);

        if (!IS_E2E) {
          void segmentClient.track("Set Removed", {
            exercise_id: exerciseId,
            logged,
            session_id: sessionId,
          });
        }
      } else {
        queryClient.setQueryData<WorkoutSession>(queryKey, (session) =>
          withSet(session, exerciseId, restored)
        );
        showSetAgain(set.id);
        Alert.alert(
          t("workoutSession.editFailed.removeSetTitle"),
          sessionEditFailureMessage(t, failure)
        );
      }

      void queryClient.invalidateQueries({ queryKey });

      if (logged) {
        void queryClient.invalidateQueries({ queryKey: ["exercise-history"] });
      }
    },
    [deleteSet, queryClient, sessionId, t]
  );
};
