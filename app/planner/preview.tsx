import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { segmentClient } from "~/lib/segment";
import { IS_E2E } from "~/lib/constants";

import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import { VStack } from "~/components/ui/vstack";
import {
  usePreviewPlanQuery,
  useStorePlanMutation,
} from "~/hooks/queries/plans";
import { ExperienceLevel, Place, Goal } from "~/lib/models";
import { Muted, P } from "~/components/ui/typography";
import { Spinner } from "~/components/ui/spinner";
import PlanDataView from "~/components/views/plan-data-view";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useQueryClient } from "@tanstack/react-query";
import { useIsProQuery } from "~/hooks/revenueCat";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";

export default function Preview() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: isPro } = useIsProQuery();

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
    error,
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
    retry: false,
    refetchInterval: false,
  });

  useEffect(() => {
    const presentPaywall = async () => {
      const result = await RevenueCatUI.presentPaywall();

      if (
        [PAYWALL_RESULT.PURCHASED, PAYWALL_RESULT.RESTORED].includes(result)
      ) {
        refetchPlan();
      }

      if (result === PAYWALL_RESULT.CANCELLED) {
        router.dismiss();
      }
    };

    if (error?.response?.status && [403, 429].includes(error.response.status)) {
      presentPaywall();
    }
  }, [error]);

  useEffect(() => {
    if (isGeneratingPlan && !IS_E2E)
      segmentClient.track("Plan Generating", {
        goal,
        place,
        frequency,
        experience_level,
        workout_duration,
      });
  }, [isGeneratingPlan]);

  useEffect(() => {
    if (planData && !IS_E2E)
      segmentClient.track("Plan Generated", {
        goal,
        place,
        frequency,
        experience_level,
        workout_duration,
      });
  }, [planData]);

  const { mutate: storePlan, isPending: isStoringPlan } = useStorePlanMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      router.dismissTo("/");
    },
  });

  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1">
        {planData && !isGeneratingPlan ? (
          <VStack className="flex-1 items-stretch">
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
              <VStack className="flex-1 p-md">
                <PlanDataView planData={planData} />
              </VStack>
            </ScrollView>
            <VStack className="px-md pb-md items-stretch gap-2">
              <Button
                onPress={async () => {
                  if (isPro || IS_E2E) {
                    storePlan(planData);
                  } else {
                    const result = await RevenueCatUI.presentPaywall();

                    if (
                      [
                        PAYWALL_RESULT.PURCHASED,
                        PAYWALL_RESULT.RESTORED,
                      ].includes(result)
                    ) {
                      storePlan(planData);
                    }
                  }
                }}
                disabled={isStoringPlan || isGeneratingPlan}
                testID="save-plan-button"
              >
                {isStoringPlan ? (
                  <Spinner size={16} className="text-black" />
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
                  <Spinner size={16} className="text-white" />
                ) : (
                  <Text>Re-generate</Text>
                )}
              </Button>
            </VStack>
          </VStack>
        ) : (
          <VStack className="flex-1 h-full justify-center items-center gap-2">
            <Spinner size={32} className="text-primary" />
            <P className="font-bold text-center text-sm">
              Hold on... AI is working hard to create your plan!
            </P>
            <Muted className="text-center text-sm">
              This may take a couple of minutes.
            </Muted>
          </VStack>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
