import type { WorkoutSessionExerciseSet } from "@fitme/core";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { reportWorkoutSetTracked } from "~/hooks/finish-workout-suggestion";
import {
  useCreateWorkoutSessionExerciseSetMutation,
  useUpdateWorkoutSessionExerciseSetMutation,
} from "~/hooks/queries/workout-session-exercise-sets";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";
import { formatSetTarget, formatSetWeight } from "~/lib/set-inputs";
import WorkoutSessionExerciseSetForm, {
  SET_TABLE_MAX_FONT_SCALE,
  type WorkoutSessionExerciseSetFormValues,
} from "../forms/workout-exercise-set-form";
import { Text } from "../ui/text";

// Never the backend's message: the User can't act on a Postgres error. Kept
// neutral, since a lost connection isn't the only way a save fails.
const SET_SAVE_ERROR = "Couldn't save this set. Try again.";

interface WorkoutSessionExerciseSetRowViewProps {
  exerciseId: string;
  hasWeight?: boolean;
  localSetId?: string;
  locked?: boolean;
  onSetCreated?: (localSetId?: string) => void;
  /** Called once a set is logged for the first time (not on edits). */
  onSetLogged?: (set: WorkoutSessionExerciseSet) => void;
  order?: number;
  sessionId: string;
  /** The User's weight unit, for the REC cell. */
  weightLabel: string | undefined;
  workoutSessionExerciseSet: WorkoutSessionExerciseSet | null;
}

export default function WorkoutSessionExerciseSetRowView({
  exerciseId,
  workoutSessionExerciseSet,
  localSetId,
  order = 0,
  hasWeight = true,
  locked = false,
  onSetCreated,
  onSetLogged,
  sessionId,
  weightLabel,
}: WorkoutSessionExerciseSetRowViewProps) {
  const queryClient = useQueryClient();
  const isNewSet = workoutSessionExerciseSet === null;
  const pendingSetData = useRef<{ weight: number; reps: number } | null>(null);
  // Reps of the set when it was submitted, before the save: the query may
  // have refetched by the time the save succeeds.
  const previousRepsCompleted = useRef<number | null>(null);

  // Whether the set is logged comes from the data, so a change made elsewhere
  // (a refetch, the Coach) shows up here. `justLogged` bridges the moment
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

  const handleSaveError = () => {
    setSaveError(SET_SAVE_ERROR);
    // Focus stays on ✓, so a screen reader wouldn't read the new message.
    AccessibilityInfo.announceForAccessibility(SET_SAVE_ERROR);
  };

  const trackSetCompleted = () => {
    if (!IS_E2E && pendingSetData.current) {
      segmentClient.track("Set Tracked", {
        exercise_id: exerciseId,
        reps: pendingSetData.current.reps,
        weight: pendingSetData.current.weight,
      });
      pendingSetData.current = null;
    }
  };

  // Shared by both saves: the set is logged, so lock the row and refresh.
  const handleSaved = (
    set: WorkoutSessionExerciseSet,
    previousReps: number | null
  ) => {
    reportWorkoutSetTracked({
      previousRepsCompleted: previousReps,
      sessionId,
      set,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaveError(null);
    setIsEditing(false);
    setJustLogged(true);
    trackSetCompleted();
    queryClient.invalidateQueries({
      queryKey: ["workout-session-exercise"],
    });
    queryClient.invalidateQueries({
      queryKey: ["workout-session"],
    });
    queryClient.invalidateQueries({
      queryKey: ["exercise-history"],
    });
    if (previousReps === null) {
      onSetLogged?.(set);
    }
  };

  const { mutate: updateWorkoutSessionExerciseSet } =
    useUpdateWorkoutSessionExerciseSetMutation({
      onError: handleSaveError,
      onSuccess: (set) => handleSaved(set, previousRepsCompleted.current),
    });

  const { mutate: createWorkoutSessionExerciseSet } =
    useCreateWorkoutSessionExerciseSetMutation({
      onError: handleSaveError,
      onSuccess: (set) => {
        handleSaved(set, null);
        onSetCreated?.(localSetId);
      },
    });

  const setOrder = isNewSet ? order : workoutSessionExerciseSet.order;
  const weightRecommended = isNewSet
    ? 0
    : (workoutSessionExerciseSet.weight_recommended ?? 0);
  const repsRecommended = isNewSet
    ? 0
    : (workoutSessionExerciseSet.reps_recommended ?? 0);
  const weightCompleted = isNewSet
    ? null
    : workoutSessionExerciseSet.weight_completed;
  const repsCompleted = isNewSet
    ? null
    : workoutSessionExerciseSet.reps_completed;

  const handleEdit = () => setIsEditing(true);

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
      disabled={!isEditable || locked}
      error={saveError}
      hasWeight={hasWeight}
      isDone={isDone}
      isEditing={isEditable}
      leading={
        <>
          <Text
            className="w-7 text-center font-ibm-plex-mono text-footnote"
            maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
          >
            #{setOrder}
          </Text>
          <Text
            adjustsFontSizeToFit
            className="w-18 text-center font-ibm-plex-mono text-footnote"
            maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
            numberOfLines={1}
          >
            {isNewSet
              ? "–"
              : formatSetTarget(workoutSessionExerciseSet, weightLabel)}
          </Text>
        </>
      }
      onEdit={handleEdit}
      onSubmit={handleSubmit}
      recommendedValues={{
        reps: (repsCompleted ?? repsRecommended).toString(),
        weight: formatSetWeight(weightCompleted ?? weightRecommended),
      }}
      setIndex={setOrder}
    />
  );
}
