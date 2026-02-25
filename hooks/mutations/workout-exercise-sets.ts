import { supabase } from "@/lib/supabase";
import { createMutation } from "react-query-kit";
import { WorkoutExerciseSet } from "~/lib/models";

type UpdateWorkoutExerciseSetData = {
  id: string;
  weight_done: number;
  repeats_done: number;
};

export const useUpdateWorkoutExerciseSetMutation = createMutation<
  WorkoutExerciseSet,
  UpdateWorkoutExerciseSetData
>({
  mutationFn: async (
    data: UpdateWorkoutExerciseSetData,
  ): Promise<WorkoutExerciseSet> => {
    const { data: result, error } = await supabase
      .from("workout_exercise_sets")
      .update({
        weight_recommended: data.weight_done,
        reps_recommended: data.repeats_done,
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    return result as unknown as WorkoutExerciseSet;
  },
});
