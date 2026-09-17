import type { WorkoutExerciseSet } from "@fitme/core";
import { createMutation } from "react-query-kit";
import { supabase } from "@/lib/supabase";

interface UpdateWorkoutExerciseSetData {
  id: string;
  repeats_done: number;
  weight_done: number;
}

export const useUpdateWorkoutExerciseSetMutation = createMutation<
  WorkoutExerciseSet,
  UpdateWorkoutExerciseSetData
>({
  mutationFn: async (
    data: UpdateWorkoutExerciseSetData
  ): Promise<WorkoutExerciseSet> => {
    const { data: result, error } = await supabase
      .from("workout_exercise_sets")
      .update({
        reps_recommended: data.repeats_done,
        weight_recommended: data.weight_done,
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) {
      throw error;
    }
    return result as unknown as WorkoutExerciseSet;
  },
});
