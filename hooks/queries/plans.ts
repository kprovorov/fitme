import { supabase } from "@/lib/supabase";
import { ExperienceLevel, Goal, Place, Plan, PlanData } from "@/lib/models";
import { createMutation, createQuery } from "react-query-kit";

const PLAN_SELECT = `
  *,
  workouts (
    *,
    sessions:workout_sessions (*),
    exercises:workout_exercises (
      *,
      exercise:exercises (*),
      sets:workout_exercise_sets (*)
    )
  )
`;

export const usePlansQuery = createQuery<Plan[]>({
  queryKey: ["plans"],
  fetcher: async (): Promise<Plan[]> => {
    const { data, error } = await supabase
      .from("plans")
      .select(PLAN_SELECT)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as unknown as Plan[];
  },
});

export type PlanQueryVariables = {
  id: number;
};

export const usePlanQuery = createQuery<Plan, PlanQueryVariables>({
  queryKey: ["plan"],
  fetcher: async ({ id }: PlanQueryVariables): Promise<Plan> => {
    const { data, error } = await supabase
      .from("plans")
      .select(PLAN_SELECT)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data as unknown as Plan;
  },
});

export const useStorePlanMutation = createMutation<Plan, PlanData>({
  mutationFn: async (planData: PlanData): Promise<Plan> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: plan, error: planError } = await supabase
      .from("plans")
      .insert({
        user_id: user!.id,
        name: planData.name,
        description: planData.description,
        goal: planData.goal,
        place: planData.place,
        frequency: planData.frequency,
        experience_level: planData.experience_level,
        workout_duration: planData.workout_duration,
        note: planData.note,
      })
      .select()
      .single();
    if (planError) throw planError;

    for (const workoutData of planData.workouts) {
      const { data: workout, error: workoutError } = await supabase
        .from("workouts")
        .insert({
          plan_id: plan.id,
          name: workoutData.name,
          description: workoutData.description,
          order: workoutData.order,
        })
        .select("id")
        .single();
      if (workoutError) throw workoutError;

      for (const exerciseData of workoutData.exercises) {
        const { data: workoutExercise, error: exerciseError } = await supabase
          .from("workout_exercises")
          .insert({
            workout_id: workout.id,
            exercise_id: exerciseData.exercise_id,
            order: exerciseData.order,
          })
          .select("id")
          .single();
        if (exerciseError) throw exerciseError;

        if (exerciseData.sets.length > 0) {
          const { error: setsError } = await supabase
            .from("workout_exercise_sets")
            .insert(
              exerciseData.sets.map((set) => ({
                workout_exercise_id: workoutExercise.id,
                order: set.order,
                reps_recommended: set.reps_recommended,
                weight_recommended: set.weight_recommended,
                rest_recommended: set.rest_recommended,
              })),
            );
          if (setsError) throw setsError;
        }
      }
    }

    const { error: activateError } = await supabase.rpc("activate_plan", {
      plan_id: plan.id,
    });
    if (activateError) throw activateError;

    return plan as unknown as Plan;
  },
});

export const useActivatePlanMutation = createMutation<Plan, { id: number }>({
  mutationFn: async (data: { id: number }): Promise<Plan> => {
    const { data: plan, error } = await supabase.rpc("activate_plan", {
      plan_id: data.id,
    });
    if (error) throw error;
    return plan as unknown as Plan;
  },
});

export const useDeletePlanMutation = createMutation<void, { id: number }>({
  mutationFn: async (data: { id: number }): Promise<void> => {
    const { error } = await supabase
      .from("plans")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
  },
});

type PreviewPlanData = {
  goal: Goal;
  place: Place;
  frequency: number;
  experience_level: ExperienceLevel;
  workout_duration: number;
  note?: string;
};

export const usePreviewPlanQuery = createQuery<PlanData, PreviewPlanData>({
  queryKey: ["plan-preview"],
  fetcher: async (data: PreviewPlanData): Promise<PlanData> => {
    const { data: result, error } = await supabase.functions.invoke(
      "preview-plan",
      { body: data },
    );
    if (error) throw error;
    return result as PlanData;
  },
});
