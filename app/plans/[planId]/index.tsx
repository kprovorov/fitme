import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, RefreshControl, ScrollView } from "react-native";
import ContextMenu from "react-native-context-menu-view";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "~/components/ui/button";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { VStack } from "~/components/ui/vstack";
import WorkoutList from "~/components/views/workout-list";
import {
  useActivatePlanMutation,
  useDeletePlanMutation,
  usePlanQuery,
} from "~/hooks/queries/plans";
import { Ellipsis } from "~/lib/icons/Ellipsis";

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
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          title: plan?.name ?? "",
          headerBackButtonDisplayMode: "minimal",
          headerLeft: () => <HeaderBackButton />,
          headerRight: () => (
            <ContextMenu
              actions={[
                {
                  title: "Activate Plan",
                  systemIcon: "bolt",
                  disabled: plan?.is_active,
                },
                {
                  title: "Archive",
                  systemIcon: "trash",
                  destructive: true,
                },
              ]}
              dropdownMenuMode
              onPress={(e) => {
                if (e.nativeEvent.name === "Activate Plan") {
                  Alert.alert(
                    "Activate Plan",
                    "This will deactivate your current plan",
                    [
                      {
                        text: "Cancel",
                        onPress: () => console.log("Cancel Pressed"),
                        style: "cancel",
                      },
                      {
                        text: "Activate",
                        onPress: () => activatePlan({ id: planId as string }),
                      },
                    ]
                  );
                }

                if (e.nativeEvent.name === "Archive") {
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
                        {
                          text: "Cancel",
                          onPress: () => console.log("Cancel Pressed"),
                          style: "cancel",
                        },
                        {
                          text: "Archive",
                          onPress: () => deletePlan({ id: planId as string }),
                        },
                      ]
                    );
                  }
                }
              }}
            >
              <Button shape="pill" size="icon-sm" variant="secondary">
                <Ellipsis className="text-foreground" size={16} />
              </Button>
            </ContextMenu>
          ),
        }}
      />
      <SafeAreaView className="flex-1">
        <ScrollView
          className="flex-1 p-6"
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
      </SafeAreaView>
    </>
  );
}
