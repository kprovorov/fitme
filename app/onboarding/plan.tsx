import React from "react";
import { H2 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { Text } from "~/components/ui/text";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { Keyboard } from "react-native";
import { KeyboardAvoidingView } from "react-native";
import { TouchableWithoutFeedback } from "react-native";
import { ScrollView } from "react-native";
import { router } from "expo-router";
import WorkoutPlanForm from "~/components/forms/workout-plans/workout-plan-form";
import { useStoreWorkoutPlanMutation } from "~/hooks/mutations/workout-plans";

export default function PlanScreen() {
  const { mutateAsync: storeWorkoutPlan } = useStoreWorkoutPlanMutation({
    onSuccess: () => {
      router.push("/");
    },
  });

  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={50}
          className="flex-1"
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView centerContent>
              <VStack className="h-full p-6 items-center justify-center gap-8">
                <VStack className="gap-2">
                  <H2 className="text-center">
                    Now, let's create your workout plan!
                  </H2>
                  <Text className="text-center">
                    We'll use this information to create a workout plan for you.
                  </Text>
                </VStack>
                <WorkoutPlanForm
                  onSubmit={async (values) => {
                    await storeWorkoutPlan(values);
                  }}
                />
              </VStack>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
