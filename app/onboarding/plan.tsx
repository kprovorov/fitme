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
import { Link, router } from "expo-router";
import WorkoutPlanForm from "~/components/forms/workout-plans/workout-plan-form";
import { useStoreWorkoutPlanMutation } from "~/hooks/mutations/workout-plans";
import { useIsProQuery } from "~/hooks/revenueCat";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import { Button } from "~/components/ui/button";
import { HStack } from "~/components/ui/hstack";
import { ChevronLeft } from "~/lib/icons/ChevronLeft";

export default function PlanScreen() {
  const { mutateAsync: storeWorkoutPlan } = useStoreWorkoutPlanMutation({
    onSuccess: () => {
      router.replace("/");
    },
  });

  const { data: isPro } = useIsProQuery();

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
              <VStack className="h-full p-6 items-center justify-center gap-4">
                <VStack className="gap-2">
                  <H2 className="text-center">
                    Now, let's create your workout plan!
                  </H2>
                </VStack>
                <WorkoutPlanForm
                  onSubmit={async (values) => {
                    if (isPro) {
                      await storeWorkoutPlan(values);
                    } else {
                      const result = await RevenueCatUI.presentPaywall();
                      if (
                        [
                          PAYWALL_RESULT.PURCHASED,
                          PAYWALL_RESULT.RESTORED,
                        ].includes(result)
                      ) {
                        await storeWorkoutPlan(values);
                      }
                    }
                  }}
                />

                <Button
                  variant="secondary"
                  className="w-full"
                  onPress={() => router.back()}
                >
                  <HStack className="gap-1">
                    <ChevronLeft size={16} className="text-white" />
                    <Text>Back</Text>
                  </HStack>
                </Button>
              </VStack>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
