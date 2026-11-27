import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Keyboard } from "react-native";

import {
  dropAddedSet,
  dropGoneAddedSet,
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
import {
  hasRefusingSessionEnded,
  mayMeanSessionEnded,
} from "~/hooks/refused-session-write";
import type { ShownSet } from "~/hooks/shown-sets";
import { analytics } from "~/lib/analytics";
import { sessionEditFailureMessage } from "~/lib/session-edit-failure";
import { isStillWriteStarter, rememberWriteStarter } from "~/lib/write-answers";
import type { WriteStarter } from "~/lib/write-answers";

/** Whether a save answered after the read's copy of the set was logged. */
const isNewerSave = (
  saved: SavedWorkoutSessionExerciseSet,
  set: WorkoutSessionSet
): boolean =>
  set.logged_at === null ||
  (saved.logged_at !== null &&
    Date.parse(saved.logged_at) > Date.parse(set.logged_at));

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
 * Puts back a set whose removal failed, behind the "Couldn't remove set"
 * alert. A refusal that may mean the session has ended reads it first: read
 * finished or gone, its screens move on instead and the set isn't put back
 * in the read (the read has it again anyway).
 * Nothing at all once the User has signed out meanwhile.
 */
const putBackUnlessEnded = async (
  client: QueryClient,
  sessionId: string,
  {
    failure,
    putBack,
    starter,
    t,
  }: {
    failure: Error | null;
    putBack: () => void;
    starter: WriteStarter;
    t: TFunction;
  }
): Promise<void> => {
  if (
    (await hasRefusingSessionEnded(client, sessionId, failure)) ||
    !isStillWriteStarter(starter)
  ) {
    return;
  }

  putBack();
  Alert.alert(
    t("workoutSession.editFailed.removeSetTitle"),
    sessionEditFailureMessage(t, failure)
  );
};

/**
 * Removes a row of a Workout Session Exercise's sets table. An added set not
 * logged yet only lives on the phone, so it's dropped there: no request, no
 * event. A saved one (a logged one once the User has confirmed, which the row
 * asks) is hidden at once and goes through `DELETE /v1/workout-session-sets/{id}`
 * (a set already gone answers 204 too): it leaves the Workout Session's read,
 * so the stats and Finish count without it, and stays hidden from the rows
 * (`hideRemovedSet`) should a read landing meanwhile still have it. A failure
 * puts it back in its place behind the "Couldn't remove set" alert, but a
 * refusal because the session has finished first reads it again at once, and
 * read finished or gone, its screens move on instead (`putBackUnlessEnded`).
 * The Workout Session is read again either way, since a lost answer may have
 * removed it, and so is Exercise history after a logged set.
 *
 * `logged` is whether the set was logged when the User acted, and `saved` what
 * logging it answered: a set just logged may not be in the read yet, and comes
 * back logged should its removal fail. Nothing happens once the read says the
 * Workout Session has finished, or there's no read (an alert answered after
 * it ended elsewhere),
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
      { id, set: shown }: ShownSet,
      logged: boolean,
      saved?: SavedWorkoutSessionExerciseSet
    ) => {
      const queryKey = useWorkoutSessionQuery.getKey({ sessionId });

      const read = queryClient.getQueryData<WorkoutSession>(queryKey);

      // Ended elsewhere: finished, or discarded and its read dropped.
      if (!read || read.finished_at) {
        return;
      }

      // A row being edited goes with its unsaved numbers.
      Keyboard.dismiss();

      // The set as the read has it now: one read while an alert was open
      // is newer than the row the User swiped.
      const set =
        shown &&
        (read.exercises
          .flatMap(({ sets }) => sets)
          .find((candidate) => candidate.id === shown.id) ??
          shown);

      if (!set) {
        dropAddedSet(exerciseId, id);

        return;
      }

      const starter = rememberWriteStarter(queryClient, []);

      // What comes back on a failure: the row's last save when the read
      // hasn't caught up with it yet (a log or an edit), else the read.
      const restored =
        saved?.id === set.id && isNewerSave(saved, set)
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
        // Added and logged here, it may live on the phone too until a read.
        dropGoneAddedSet(exerciseId, set.id);

        void analytics.send("Set Removed", {
          exercise_id: exerciseId,
          logged,
          session_id: sessionId,
        });
      } else {
        await putBackUnlessEnded(queryClient, sessionId, {
          failure,
          putBack: () => {
            queryClient.setQueryData<WorkoutSession>(queryKey, (session) =>
              withSet(session, exerciseId, restored)
            );
          },
          starter,
          t,
        });
        // Its row shows again wherever the set is read: a finished session's
        // read only Summary too, once its screens have moved on.
        showSetAgain(set.id);
      }

      if (!isStillWriteStarter(starter)) {
        return;
      }

      // A refusal that may mean the session ended has read it again already.
      if (removed || !mayMeanSessionEnded(failure)) {
        void queryClient.invalidateQueries({ queryKey });
      }

      if (logged) {
        void queryClient.invalidateQueries({ queryKey: ["exercise-history"] });
      }
    },
    [deleteSet, queryClient, sessionId, t]
  );
};
