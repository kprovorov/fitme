import React, { useState } from "react";
import { VStack } from "../ui/vstack";
import { H2, P } from "../ui/typography";
import WorkoutPlanForm, {
  WorkoutPlanFormValues,
} from "../forms/workout-plans/workout-plan-form";
import { handleAxiosError } from "~/lib/utils";
import { FieldErrors } from "react-hook-form";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useStorePlanMutation } from "~/hooks/queries/plans";

export default function CreateWorkoutPlanView() {
  const queryClient = useQueryClient();

  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [errors, setErrors] = useState<FieldErrors<WorkoutPlanFormValues>>();

  const { mutateAsync: storePlan } = useStorePlanMutation({
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
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
          await storePlan(values);
        }}
        errors={errors}
      />
    </VStack>
  );
}
