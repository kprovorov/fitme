import { rateLimitedFor } from "@fitme/api-client";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, View } from "react-native";

import { SymbolImage } from "~/components/symbol-image";
import { reportWorkoutSetTracked } from "~/hooks/finish-workout-suggestion";
import {
  useCreateWorkoutSessionExerciseSetMutation,
  useUpdateWorkoutSessionExerciseSetMutation,
} from "~/hooks/queries/workout-session-exercise-sets";
import type { SavedWorkoutSessionExerciseSet } from "~/hooks/queries/workout-session-exercise-sets";
import { WORKOUT_SESSION_QUERY_KEY } from "~/hooks/queries/workout-sessions";
import type { WorkoutSessionSet } from "~/hooks/queries/workout-sessions";
import { IS_E2E } from "~/lib/constants";
import { useI18n } from "~/lib/i18n";
import { segmentClient } from "~/lib/segment";
import { formatSetTarget, formatSetWeight } from "~/lib/set-inputs";
import { cn } from "~/lib/utils";

import WorkoutSessionExerciseSetForm, {
  SET_NUMBER_COLUMN_CLASS,
  SET_TABLE_MAX_FONT_SCALE,
} from "../forms/workout-exercise-set-form";
import type { WorkoutSessionExerciseSetFormValues } from "../forms/workout-exercise-set-form";
import { Text } from "../ui/text";

interface WorkoutSessionExerciseSetRowViewProps {
  exerciseId: string;
  /**
   * A set not saved yet: the reps and weight it starts from (the set before
   * it), 0 for each one not given.
   */
  initialValues?: { reps: number; weight: number };
  localSetId?: string;
  locked?: boolean;
  onSetCreated?: (localSetId?: string) => void;
  /** Called once a set is logged for the first time (not on edits). */
  onSetLogged?: (set: SavedWorkoutSessionExerciseSet) => void;
  order?: number;
  sessionId: string;
  /** The User's weight unit, for the target cell. */
  weightLabel: string | undefined;
  workoutSessionExerciseSet: WorkoutSessionSet | null;
}

const getSetValues = (
  set: WorkoutSessionSet | null,
  initialValues: { reps: number; weight: number } | undefined
) => ({
  repsCompleted: set?.reps_completed ?? null,
  repsRecommended: set?.reps_recommended ?? initialValues?.reps ?? 0,
  weightCompleted: set?.weight_completed ?? null,
  weightRecommended: set?.weight_recommended ?? initialValues?.weight ?? 0,
});

const WorkoutSessionExerciseSetRowView = ({
  exerciseId,
  initialValues,
  workoutSessionExerciseSet,
  localSetId,
  order = 0,
  locked = false,
  onSetCreated,
  onSetLogged,
  sessionId,
  weightLabel,
}: WorkoutSessionExerciseSetRowViewProps) => {
  const { t } = useTranslation();
  const i18n = useI18n();
  const queryClient = useQueryClient();
  const isNewSet = workoutSessionExerciseSet === null;
  const pendingSetData = useRef<{ weight: number; reps: number } | null>(null);
  // Reps of the set when it was submitted, before the save: the query may
  // have refetched by the time the save succeeds.
  const previousRepsCompleted = useRef<number | null>(null);

  // Whether the set is logged comes from the data, so a change made elsewhere
  // (a refetch, Arnold) shows up here. `justLogged` bridges the moment
  // between a successful save and the refetch that carries it.
  const loggedReps = isNewSet ? null : workoutSessionExerciseSet.reps_completed;
  const [justLogged, setJustLogged] = useState(false);
  const [seenReps, setSeenReps] = useState(loggedReps);

  if (loggedReps !== seenReps) {
    setSeenReps(loggedReps);
    setJustLogged(false);
  }

  const [isEditing, setIsEditing] = useState(false);
  const isDone = loggedReps !== null || justLogged;
  const isEditable = !isDone || isEditing;
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveError = (waitSeconds: number | null) => {
    // Never the backend's message: the User can't act on a Postgres error.
    // Kept neutral, since a lost connection isn't the only way a save fails.
    const message =
      waitSeconds === null
        ? t("sets.errors.save")
        : t("sets.errors.rateLimited", { seconds: waitSeconds });

    setSaveError(message);
    // Focus stays on ✓, so a screen reader wouldn't read the new message.
    AccessibilityInfo.announceForAccessibility(message);
  };

  const trackSetCompleted = () => {
    if (!IS_E2E && pendingSetData.current) {
      void segmentClient.track("Set Tracked", {
        exercise_id: exerciseId,
        reps: pendingSetData.current.reps,
        weight: pendingSetData.current.weight,
      });
      pendingSetData.current = null;
    }
  };

  // Shared by both saves: the set is logged, so lock the row and refresh.
  const handleSaved = (
    set: SavedWorkoutSessionExerciseSet,
    previousReps: number | null
  ) => {
    reportWorkoutSetTracked({
      previousRepsCompleted: previousReps,
      sessionId,
      set,
    });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaveError(null);
    setIsEditing(false);
    setJustLogged(true);
    trackSetCompleted();
    void queryClient.invalidateQueries({
      queryKey: WORKOUT_SESSION_QUERY_KEY,
    });
    void queryClient.invalidateQueries({
      queryKey: ["exercise-history"],
    });

    if (previousReps === null) {
      onSetLogged?.(set);
    }
  };

  const { mutate: updateWorkoutSessionExerciseSet } =
    useUpdateWorkoutSessionExerciseSetMutation({
      onError: (error) => handleSaveError(rateLimitedFor(error)),
      onSuccess: (set) => handleSaved(set, previousRepsCompleted.current),
    });

  const { mutate: createWorkoutSessionExerciseSet } =
    useCreateWorkoutSessionExerciseSetMutation({
      onError: (error) => handleSaveError(rateLimitedFor(error)),
      onSuccess: (set) => {
        handleSaved(set, null);
        onSetCreated?.(localSetId);
      },
    });

  const setOrder = isNewSet ? order : workoutSessionExerciseSet.order;

  const { weightRecommended, repsRecommended, weightCompleted, repsCompleted } =
    getSetValues(workoutSessionExerciseSet, initialValues);

  const handleEdit = () => setIsEditing(true);
  // A logged set reads as done until it's opened for editing.
  const showsLogged = isDone && !isEditing;

  const handleSubmit = (values: WorkoutSessionExerciseSetFormValues) => {
    // An empty field keeps what's shown as its placeholder: the logged value
    // when editing a logged set, otherwise the recommended one.
    const weight_completed =
      values.weight ?? weightCompleted ?? weightRecommended;

    const reps_completed = values.reps ?? repsCompleted ?? repsRecommended;

    pendingSetData.current = {
      reps: reps_completed,
      weight: weight_completed,
    };
    previousRepsCompleted.current = repsCompleted;

    if (isNewSet) {
      createWorkoutSessionExerciseSet({
        data: {
          reps_completed,
          weight_completed,
        },
        params: {
          exerciseId,
        },
      });
    } else {
      updateWorkoutSessionExerciseSet({
        data: {
          reps_completed,
          weight_completed,
        },
        params: {
          setId: workoutSessionExerciseSet.id,
        },
      });
    }
  };

  return (
    <WorkoutSessionExerciseSetForm
      // A logged set stays editable when an earlier one is still open: its
      // pencil would otherwise open a row nothing can save.
      disabled={!isEditable || (locked && !isDone)}
      error={saveError}
      isDone={isDone}
      isEditing={isEditable}
      leading={
        <>
          {showsLogged ? (
            <View className={cn(SET_NUMBER_COLUMN_CLASS, "items-center")}>
              <SymbolImage
                accessibilityLabel={t("sets.row.logged", { order: setOrder })}
                className="text-body-emphasized text-primary"
                name="checkmark"
              />
            </View>
          ) : (
            <Text
              // At body size `#2` fills the column: shrink it at the largest
              // text sizes rather than wrap it onto a second line.
              adjustsFontSizeToFit
              className="text-mono-body w-7 text-center"
              maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
              numberOfLines={1}
            >
              #{setOrder}
            </Text>
          )}
          <Text
            adjustsFontSizeToFit
            className="text-mono-body w-20 text-center"
            maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
            numberOfLines={1}
            variant={showsLogged ? "muted" : "default"}
          >
            {isNewSet
              ? "–"
              : formatSetTarget(workoutSessionExerciseSet, weightLabel, i18n)}
          </Text>
        </>
      }
      onEdit={handleEdit}
      onSubmit={handleSubmit}
      recommendedValues={{
        reps: (repsCompleted ?? repsRecommended).toString(),
        weight: formatSetWeight(weightCompleted ?? weightRecommended, i18n),
      }}
      setIndex={setOrder}
    />
  );
};

export default WorkoutSessionExerciseSetRowView;
