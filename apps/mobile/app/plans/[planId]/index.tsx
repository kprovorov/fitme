import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { Alert, RefreshControl, ScrollView } from "react-native";
import { VStack } from "~/components/ui/vstack";
import WorkoutList from "~/components/views/workout-list";
import {
  useActivatePlanMutation,
  useDeletePlanMutation,
  usePlanQuery,
} from "~/hooks/queries/plans";
import { ApiError, rateLimitedFor } from "~/lib/api/client";

/**
 * What to tell the User after a failed Plan write. A failure other than a 404
 * or a 429 doesn't prove nothing changed (the answer can be lost after the
 * write commits), so it never says either way.
 */
const failureMessage = (error: unknown) => {
  if (error instanceof ApiError && error.code === "not_found") {
    return "This plan no longer exists.";
  }
  const waitSeconds = rateLimitedFor(error);
  return waitSeconds === null
    ? "Please check your connection and try again."
    : `Too many requests: please try again in ${waitSeconds} s.`;
};

export default function PlanScreen() {
  const { planId } = useLocalSearchParams();
  const queryClient = useQueryClient();
  const router = useRouter();

  // A failed call doesn't prove nothing changed, so the Plans are read again
  // either way.
  const refreshPlans = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["plans"] });
    queryClient.invalidateQueries({ queryKey: ["plan"] });
  }, [queryClient]);

  const { mutate: activatePlan } = useActivatePlanMutation({
    onError: (error) => {
      Alert.alert("Couldn't Activate Plan", failureMessage(error));
    },
    onSettled: refreshPlans,
    onSuccess: () => {
      router.dismissTo("/");
    },
  });

  const { mutate: deletePlan } = useDeletePlanMutation({
    onError: (error) => {
      Alert.alert("Couldn't Archive Plan", failureMessage(error));
    },
    onSettled: refreshPlans,
    onSuccess: () => {
      router.dismissTo("/");
    },
  });

  const {
    data: plan,
    isLoading,
    refetch,
  } = usePlanQuery({
    variables: {
      id: planId as string,
    },
  });

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: plan?.name ?? "",
          unstable_headerRightItems: () => [
            {
              icon: {
                name: "ellipsis",
                type: "sfSymbol",
              },
              label: "Manage",
              menu: {
                items: [
                  {
                    icon: {
                      name: "bolt",
                      type: "sfSymbol",
                    },
                    label: "Activate Plan",
                    onPress: () => {
                      Alert.alert(
                        "Activate Plan",
                        "This will deactivate your current plan",
                        [
                          { style: "cancel", text: "Cancel" },
                          {
                            onPress: () =>
                              activatePlan({ id: planId as string }),
                            text: "Activate",
                          },
                        ]
                      );
                    },
                    type: "action",
                  },
                  {
                    destructive: true,
                    icon: {
                      name: "trash",
                      type: "sfSymbol",
                    },
                    label: "Archive",
                    onPress: () => {
                      if (plan?.is_active) {
                        Alert.alert(
                          "Archive Plan",
                          "You cannot archive an active plan. You should have at least one active plan at all times."
                        );
                      } else {
                        Alert.alert(
                          "Archive Plan",
                          "Are you sure you want to archive this plan?",
                          [
                            { style: "cancel", text: "Cancel" },
                            {
                              onPress: () =>
                                deletePlan({ id: planId as string }),
                              style: "destructive",
                              text: "Archive",
                            },
                          ]
                        );
                      }
                    },
                    type: "action",
                  },
                ],
              },
              type: "menu",
            },
          ],
        }}
      />
      <ScrollView
        className="flex-1 p-6"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={isLoading} />
        }
      >
        {plan ? (
          <VStack className="flex-1 items-stretch">
            <WorkoutList workouts={plan.workouts} />
          </VStack>
        ) : null}
      </ScrollView>
    </>
  );
}
