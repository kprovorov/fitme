import { router, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { VStack } from "~/components/ui/vstack";
import {
  usePreviewPlanQuery,
  useStorePlanMutation,
} from "~/hooks/queries/plans";
import { ExperienceLevel, Place } from "~/lib/models";
import { Goal } from "~/lib/models";
import { Muted } from "~/components/ui/typography";
import { P } from "~/components/ui/typography";
import { LoaderCircle } from "~/lib/icons/LoaderCircle";
import PlanDataView from "~/components/views/plan-data-view";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useQueryClient } from "@tanstack/react-query";
export default function Preview() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { goal, place, frequency, experience_level, workout_duration, note } =
    useLocalSearchParams<{
      goal: string;
      place: string;
      frequency: string;
      experience_level: string;
      workout_duration: string;
      note: string;
    }>();

  const {
    data: planData,
    isFetching: isGeneratingPlan,
    refetch: refetchPlan,
  } = usePreviewPlanQuery({
    variables: {
      goal: goal as Goal,
      place: place as Place,
      frequency: parseInt(frequency),
      experience_level: experience_level as ExperienceLevel,
      workout_duration: parseInt(workout_duration),
      note,
    },
  });

  const { mutate: storePlan, isPending: isStoringPlan } = useStorePlanMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      router.dismissTo("/");
    },
  });

  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1">
        {isGeneratingPlan ? (
          <VStack className="flex-1 h-full justify-center items-center gap-2">
            <View className="animate-spin">
              <LoaderCircle size={32} className="text-primary" />
            </View>
            <P className="font-bold text-center text-sm">
              Hold on... AI is working hard to create your plan!
            </P>
            <Muted className="text-center text-sm">
              This may take a couple of minutes.
            </Muted>
          </VStack>
        ) : planData ? (
          <VStack className="flex-1 items-stretch">
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
              <VStack className="flex-1 p-md">
                <PlanDataView planData={planData} />
              </VStack>
            </ScrollView>
            <VStack className="px-md pb-md items-stretch gap-2">
              <Button
                onPress={() => storePlan(planData)}
                disabled={isStoringPlan || isGeneratingPlan}
              >
                {isStoringPlan ? (
                  <View className="animate-spin">
                    <LoaderCircle size={16} className="text-black" />
                  </View>
                ) : (
                  <Text>Save</Text>
                )}
              </Button>
              <Button
                variant="secondary"
                onPress={() => refetchPlan()}
                disabled={isStoringPlan || isGeneratingPlan}
              >
                {isGeneratingPlan ? (
                  <View className="animate-spin">
                    <LoaderCircle size={16} className="text-white" />
                  </View>
                ) : (
                  <Text>Re-generate</Text>
                )}
              </Button>
            </VStack>
          </VStack>
        ) : (
          <VStack className="flex-1 h-full justify-center items-center gap-2">
            <P className="font-bold text-center text-sm">
              No plan found. Please try again.
            </P>
          </VStack>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
