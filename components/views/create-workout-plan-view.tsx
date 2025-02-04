import React, { useState } from "react";
import { VStack } from "../ui/vstack";
import { H2, P } from "../ui/typography";
import WorkoutPlanForm, {
  WorkoutPlanFormValues,
} from "../forms/workout-plans/workout-plan-form";
import { useStoreWorkoutPlanMutation } from "~/hooks/mutations/workout-plans";
import { handleAxiosError } from "~/lib/utils";
import { FieldErrors } from "react-hook-form";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

export default function CreateWorkoutPlanView() {
  const queryClient = useQueryClient();

  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [errors, setErrors] = useState<FieldErrors<WorkoutPlanFormValues>>();

  const { mutateAsync: storeWorkoutPlan } = useStoreWorkoutPlanMutation({
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["workout-plans"] });
      router.push(`/workout-plans/${res.id}`);
    },
    onError: (error) => {
      handleAxiosError(error, setErrorMessage, setErrors);
    },
  });

  return (
    <VStack>
      <H2>Create Workout Plan</H2>
      {errorMessage && <P className="text-red-500">{errorMessage}</P>}
      <WorkoutPlanForm
        onSubmit={async (values) => {
          await storeWorkoutPlan(values);
        }}
        errors={errors}
      />
    </VStack>
  );
}
