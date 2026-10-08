import type { WorkoutSessionExerciseSet } from "@fitme/core";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { reportWorkoutSetTracked } from "~/hooks/finish-workout-suggestion";
import {
  useCreateWorkoutSessionExerciseSetMutation,
  useUpdateWorkoutSessionExerciseSetMutation,
} from "~/hooks/queries/workout-session-exercise-sets";
import { IS_E2E } from "~/lib/constants";
import { Check } from "~/lib/icons/Check";
import { ClockFading } from "~/lib/icons/ClockFading";
import { segmentClient } from "~/lib/segment";
import { cn } from "~/lib/utils";
import WorkoutSessionExerciseSetForm, {
  type WorkoutSessionExerciseSetFormValues,
} from "../forms/workout-exercise-set-form";
import { HStack } from "../ui/hstack";
import { Separator } from "../ui/separator";
import { Text } from "../ui/text";

interface WorkoutSessionExerciseSetRowViewProps {
  exerciseId: string;
  hasWeight?: boolean;
  localSetId?: string;
  locked?: boolean;
  onSetCreated?: (localSetId?: string) => void;
  order?: number;
  sessionId: string;
  timer?: boolean;
  workoutSessionExerciseSet: WorkoutSessionExerciseSet | null;
}

export default function WorkoutSessionExerciseSetRowView({
  exerciseId,
  workoutSessionExerciseSet,
  localSetId,
  order = 0,
  hasWeight = true,
  timer = true,
  locked = false,
  onSetCreated,
  sessionId,
}: WorkoutSessionExerciseSetRowViewProps) {
  const queryClient = useQueryClient();
  const isNewSet = workoutSessionExerciseSet === null;
  const pendingSetData = useRef<{ weight: number; reps: number } | null>(null);
  // Reps of the set when it was submitted, before the save: the query may
  // have refetched by the time the save succeeds.
  const previousRepsCompleted = useRef<number | null>(null);

  const [isEditable, setIsEditable] = useState(
    isNewSet || workoutSessionExerciseSet.reps_completed === null
  );
  const [isDone, setIsDone] = useState(
    !isNewSet && workoutSessionExerciseSet.reps_completed !== null
  );

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

  const { mutate: updateWorkoutSessionExerciseSet } =
    useUpdateWorkoutSessionExerciseSetMutation({
      onSuccess: (set) => {
        reportWorkoutSetTracked({
          previousRepsCompleted: previousRepsCompleted.current,
          sessionId,
          set,
        });
        setIsEditable(false);
        setIsDone(true);
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
        setIsEditable(false);
        setIsDone(true);
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
  const restRecommended = isNewSet
    ? null
    : workoutSessionExerciseSet.rest_recommended;

  const handleEdit = () => setIsEditable(true);

  const handleSubmit = (values: WorkoutSessionExerciseSetFormValues) => {
    const weight_completed = values.weight
      ? Number(values.weight.replace(",", "."))
      : weightRecommended;
    const reps_completed = values.reps ? Number(values.reps) : repsRecommended;

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
    <HStack className="justify-start py-sm">
      {isDone ? (
        <HStack className="w-12">
          <Check className="text-primary" size={16} strokeWidth={3} />
        </HStack>
      ) : (
        <Text className="w-12 text-center font-bold">#{setOrder}</Text>
      )}

      <WorkoutSessionExerciseSetForm
        disabled={!isEditable || locked}
        hasWeight={hasWeight}
        isDone={isDone}
        isEditing={isEditable}
        onEdit={handleEdit}
        onSubmit={handleSubmit}
        recommendedValues={{
          reps: (repsCompleted ?? repsRecommended).toString(),
          weight: (weightCompleted ?? weightRecommended)
            .toFixed(2)
            .replace(".00", "")
            .replace(".", ","),
        }}
        setIndex={setOrder}
      />

      <HStack className={cn("absolute inset-x-0 -bottom-3 h-6 gap-1")}>
        <Separator className={cn("flex-1", timer && "bg-primary")} />
        {!!restRecommended && (
          <>
            <HStack
              className={cn(
                "h-6 gap-1 rounded-full px-1.5",
                timer && "bg-primary"
              )}
            >
              <ClockFading
                className={cn(
                  timer ? "text-primary-foreground" : "text-muted-foreground"
                )}
                size={12}
              />
              <Text
                className={cn(
                  "text-footnote",
                  timer ? "text-primary-foreground" : "text-muted-foreground"
                )}
              >
                {restRecommended}s
              </Text>
            </HStack>
            <Separator className={cn("flex-1", timer && "bg-primary")} />
          </>
        )}
      </HStack>
    </HStack>
  );
}
