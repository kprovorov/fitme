import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { TFunction } from "i18next";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
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
const failureMessage = (t: TFunction, error: unknown) => {
  if (error instanceof ApiError && error.code === "not_found") {
    return t("plans.errors.notFound");
  }
  const waitSeconds = rateLimitedFor(error);
  return waitSeconds === null
    ? t("plans.errors.network")
    : t("plans.errors.rateLimited", { seconds: waitSeconds });
};

export default function PlanScreen() {
  const { planId } = useLocalSearchParams();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { t } = useTranslation();

  // A failed call doesn't prove nothing changed, so the Plans are read again
  // either way.
  const refreshPlans = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["plans"] });
    queryClient.invalidateQueries({ queryKey: ["plan"] });
  }, [queryClient]);

  const { mutate: activatePlan } = useActivatePlanMutation({
    onError: (error) => {
      Alert.alert(t("plans.activate.failed"), failureMessage(t, error));
    },
    onSettled: refreshPlans,
    onSuccess: () => {
      router.dismissTo("/");
    },
  });

  const { mutate: deletePlan } = useDeletePlanMutation({
    onError: (error) => {
      Alert.alert(t("plans.archive.failed"), failureMessage(t, error));
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
              label: t("plans.manage"),
              menu: {
                items: [
                  {
                    icon: {
                      name: "bolt",
                      type: "sfSymbol",
                    },
                    label: t("plans.activate.action"),
                    onPress: () => {
                      Alert.alert(
                        t("plans.activate.title"),
                        t("plans.activate.message"),
                        [
                          { style: "cancel", text: t("common.cancel") },
                          {
                            onPress: () =>
                              activatePlan({ id: planId as string }),
                            text: t("plans.activate.confirm"),
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
                    label: t("plans.archive.action"),
                    onPress: () => {
                      if (plan?.is_active) {
                        Alert.alert(
                          t("plans.archive.title"),
                          t("plans.archive.activePlan")
                        );
                      } else {
                        Alert.alert(
                          t("plans.archive.title"),
                          t("plans.archive.message"),
                          [
                            { style: "cancel", text: t("common.cancel") },
                            {
                              onPress: () =>
                                deletePlan({ id: planId as string }),
                              style: "destructive",
                              text: t("plans.archive.confirm"),
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
