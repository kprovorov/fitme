import React, { useState } from "react";
import PlannerForm from "../forms/planner/planner-form";
import { useStoreProfileMutation } from "@/hooks/queries/profiles";
import { H1, H3, Muted, P } from "~/components/ui/typography";
import { VStack } from "../ui/vstack";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useActivateWorkoutPlanMutation,
  useStoreWorkoutPlanMutation,
} from "~/hooks/mutations/workout-plans";
import { Platform } from "react-native";
import { Keyboard } from "react-native";
import {
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
} from "react-native";
import { handleAxiosError } from "~/lib/utils";

export default function PlannerView() {
  const queryClient = useQueryClient();

  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const { mutateAsync: storeProfile, isPending } = useStoreProfileMutation({
    onError: (error) => {
      handleAxiosError(error, setErrorMessage);
    },
  });

  const { mutateAsync: storeWorkoutPlan, isPending: isWorkoutPlanPending } =
    useStoreWorkoutPlanMutation({
      onSuccess: (res) => {
        activateWorkoutPlan({ id: res.id });
      },
      onError: (error) => {
        handleAxiosError(error, setErrorMessage);
      },
    });

  const { mutateAsync: activateWorkoutPlan } = useActivateWorkoutPlanMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout-plans"] });
      router.push(`/`);
    },
    onError: (error) => {
      handleAxiosError(error, setErrorMessage);
    },
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={50}
      className="flex-1"
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView centerContent>
          <VStack>
            <H1>Welcome to Fitme!</H1>
            <H3>Your AI fitness coach</H3>
          </VStack>
          {errorMessage && <P className="text-red-500">{errorMessage}</P>}
          <PlannerForm
            onSubmit={async (values) => {
              await storeProfile({
                gender: values.gender,
                age: values.age,
                weight: values.weight,
                height: values.height,
              });

              await storeWorkoutPlan({
                goal: values.goal,
                place: values.place,
                frequency: values.frequency,
              });
            }}
          />

          {isPending ||
            (isWorkoutPlanPending && (
              <VStack className="gap-0">
                <P className="font-bold">
                  Hold on... AI is working hard to create your plan!
                </P>
                <Muted>This may take a couple of minutes.</Muted>
              </VStack>
            ))}
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
