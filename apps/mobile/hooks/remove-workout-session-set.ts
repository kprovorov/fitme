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
import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import type { ShownSet } from "~/hooks/shown-sets";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";
import { sessionEditFailureMessage } from "~/lib/session-edit-failure";
import { isStillWriteStarter, rememberWriteStarter } from "~/lib/write-answers";

/**
 * Removes a row of a Workout Session Exercise's sets table. An added set not
 * logged yet only lives on the phone, so it's dropped there: no request, no
 * event. A saved one is hidden at once and goes through
 * `DELETE /v1/workout-session-sets/{id}` (a set already gone answers 204
 * too); a failure shows it again in its place behind the "Couldn't remove
 * set" alert. The Workout Session is read again either way, since a lost
 * answer may have removed it. Once the User who removed it has signed out,
 * nothing is shown, alerted, sent or read.
 *
 * It asks nothing: a logged set's confirmation goes before calling it.
 */
export const useRemoveWorkoutSessionSet = (sessionId: string) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mutateAsync: deleteSet } = useDeleteWorkoutSessionSetMutation();

  const removeOnApi = useCallback(
    async (
      setId: string
    ): Promise<{ ok: true } | { error: unknown; ok: false }> => {
      try {
        await deleteSet({ setId });

        return { ok: true };
      } catch (error) {
        return { error, ok: false };
      }
    },
    [deleteSet]
  );

  return useCallback(
    async (exerciseId: string, { id, set }: ShownSet) => {
      // A row being edited goes with its unsaved numbers.
      Keyboard.dismiss();

      if (!set) {
        dropAddedSet(exerciseId, id);

        return;
      }

      const starter = rememberWriteStarter(queryClient, []);
      // Should it come back, no set added meanwhile takes its place.
      holdOrder(exerciseId, set.order);
      hideRemovedSet(exerciseId, set.id);

      const removal = await removeOnApi(set.id);

      if (!isStillWriteStarter(starter)) {
        return;
      }

      if (removal.ok) {
        markSetRemoved(set.id);

        if (!IS_E2E) {
          void segmentClient.track("Set Removed", {
            exercise_id: exerciseId,
            logged: set.reps_completed !== null,
            session_id: sessionId,
          });
        }
      } else {
        showSetAgain(set.id);
        Alert.alert(
          t("workoutSession.editFailed.removeSetTitle"),
          sessionEditFailureMessage(t, removal.error)
        );
      }

      void queryClient.invalidateQueries({
        queryKey: useWorkoutSessionQuery.getKey({ sessionId }),
      });
    },
    [queryClient, removeOnApi, sessionId, t]
  );
};
