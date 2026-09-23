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
