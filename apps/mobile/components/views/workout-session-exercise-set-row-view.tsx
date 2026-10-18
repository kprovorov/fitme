import {
  formatSetResult,
  type SetResult,
  type WorkoutSessionExerciseSet,
} from "@fitme/core";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import { View } from "react-native";
import { reportWorkoutSetTracked } from "~/hooks/finish-workout-suggestion";
import {
  useCreateWorkoutSessionExerciseSetMutation,
  useUpdateWorkoutSessionExerciseSetMutation,
} from "~/hooks/queries/workout-session-exercise-sets";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";
import { cn } from "~/lib/utils";
import WorkoutSessionExerciseSetForm, {
  SET_TABLE_MAX_FONT_SCALE,
  type WorkoutSessionExerciseSetFormValues,
} from "../forms/workout-exercise-set-form";
import { Text } from "../ui/text";

interface WorkoutSessionExerciseSetRowViewProps {
  exerciseId: string;
  hasWeight?: boolean;
  localSetId?: string;
  locked?: boolean;
  /** Called once a set is logged for the first time (not on edits). */
  onSetLogged?: (set: WorkoutSessionExerciseSet) => void;
  onSetCreated?: (localSetId?: string) => void;
  order?: number;
  /** The same set in the exercise's previous session, if any. */
  previous?: SetResult;
  sessionId: string;
  workoutSessionExerciseSet: WorkoutSessionExerciseSet | null;
}

/** `17.5`, `62`: weights without trailing zeros. */
const formatWeightValue = (weight: number) =>
  Number(weight.toFixed(2)).toString();

export default function WorkoutSessionExerciseSetRowView({
  exerciseId,
  workoutSessionExerciseSet,
  localSetId,
  order = 0,
  hasWeight = true,
  locked = false,
  onSetCreated,
  onSetLogged,
  previous,
  sessionId,
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

  const handleLogged = (
    set: WorkoutSessionExerciseSet,
    repsBefore: number | null
  ) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    if (repsBefore === null) {
      onSetLogged?.(set);
    }
  };

  const { mutate: updateWorkoutSessionExerciseSet } =
    useUpdateWorkoutSessionExerciseSetMutation({
      onSuccess: (set) => {
        reportWorkoutSetTracked({
          previousRepsCompleted: previousRepsCompleted.current,
          sessionId,
          set,
        });
        handleLogged(set, previousRepsCompleted.current);
      },
    });

  const { mutate: createWorkoutSessionExerciseSet } =
    useCreateWorkoutSessionExerciseSetMutation({
      onSuccess: (set) => {
        reportWorkoutSetTracked({
          previousRepsCompleted: null,
          sessionId,
          set,
        });
        handleLogged(set, null);
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
    const weight_completed = values.weight
      ? Number(values.weight.replace(",", "."))
      : (weightCompleted ?? weightRecommended);
    const reps_completed = values.reps
      ? Number(values.reps)
      : (repsCompleted ?? repsRecommended);

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

  const showsLogged = isDone && !isEditable;

  return (
    <View
      className={cn(
        "flex-row items-center gap-2 rounded-xl border-continuous py-1 pr-1 pl-2",
        showsLogged && "bg-primary/10"
      )}
    >
      <Text
        className={cn(
          "w-7 font-ibm-plex-mono-semibold text-body",
          showsLogged && "text-primary"
        )}
        maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
      >
        {setOrder}
      </Text>
      <Text
        className="flex-1 font-ibm-plex-mono text-footnote text-muted-foreground"
        maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
        numberOfLines={1}
      >
        {previous ? formatSetResult(previous) : "–"}
      </Text>

      <WorkoutSessionExerciseSetForm
        disabled={!isEditable || locked}
        hasWeight={hasWeight}
        isDone={isDone}
        isEditing={isEditable}
        onEdit={handleEdit}
        onSubmit={handleSubmit}
        recommendedValues={{
          reps: (repsCompleted ?? repsRecommended).toString(),
          weight: formatWeightValue(weightCompleted ?? weightRecommended),
        }}
        setIndex={setOrder}
      />
    </View>
  );
}
