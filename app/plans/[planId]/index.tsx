import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, RefreshControl, ScrollView } from "react-native";
import { VStack } from "~/components/ui/vstack";
import WorkoutList from "~/components/views/workout-list";
import {
  useActivatePlanMutation,
  useDeletePlanMutation,
  usePlanQuery,
} from "~/hooks/queries/plans";

export default function PlanScreen() {
  const { planId } = useLocalSearchParams();
  const queryClient = useQueryClient();
  const router = useRouter();

  const { mutate: activatePlan, isPending: _isActivatingPlan } =
    useActivatePlanMutation({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["plans"] });
        router.dismissTo("/");
      },
    });

  const { mutate: deletePlan, isPending: _isDeletingPlan } =
    useDeletePlanMutation({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["plans"] });
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

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          title: plan?.name ?? "",
          headerBackButtonDisplayMode: "minimal",
          unstable_headerRightItems: () => [
            {
              type: "menu",
              label: "Manage",
              icon: {
                type: "sfSymbol",
                name: "ellipsis",
              },
              menu: {
                items: [
                  {
                    type: "action",
                    label: "Activate Plan",
                    icon: {
                      type: "sfSymbol",
                      name: "bolt",
                    },
                    onPress: () => {
                      Alert.alert(
                        "Activate Plan",
                        "This will deactivate your current plan",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Activate",
                            onPress: () =>
                              activatePlan({ id: planId as string }),
                          },
                        ]
                      );
                    },
                  },
                  {
                    type: "action",
                    label: "Archive",
                    destructive: true,
                    icon: {
                      type: "sfSymbol",
                      name: "trash",
                    },
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
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Archive",
                              style: "destructive",
                              onPress: () =>
                                deletePlan({ id: planId as string }),
                            },
                          ]
                        );
                      }
                    },
                  },
                ],
              },
            },
          ],
        }}
      />
      <ScrollView
        className="flex-1 p-6"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl onRefresh={refetch} refreshing={isLoading} />
        }
      >
        {plan && (
          <VStack className="flex-1 items-stretch">
            <WorkoutList workouts={plan.workouts} />
          </VStack>
        )}
      </ScrollView>
    </>
  );
}
