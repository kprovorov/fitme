import { rateLimitedFor } from "@fitme/api-client";
import { Link } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";
import { usePlanSummariesQuery } from "~/hooks/queries/plans";
import PlanCard from "../plans/plan-card";
import { Button } from "../ui/button";
import { Text } from "../ui/text";
import { VStack } from "../ui/vstack";

/**
 * The User's live Plans, newest first, through `GET /v1/plans`, then Create.
 * A failed refresh keeps the Plans shown; with none read yet a failure is
 * the load error (the wait for a 429) with Try Again.
 */
export default function PlansListView() {
  const { data: plans, error, isError, refetch } = usePlanSummariesQuery();
  const { t } = useTranslation();
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  const renderPlans = () => {
    if (plans) {
      return plans.map((plan) => (
        // `asChild` keeps the card out of the Text wrapper Link renders by
        // default, which clips the top edge of an inlined View.
        <Link asChild href={`/plans/${plan.id}`} key={plan.id}>
          <Pressable className="active:opacity-80">
            <PlanCard plan={plan} />
          </Pressable>
        </Link>
      ));
    }
    if (isError) {
      const waitSeconds = rateLimitedFor(error);
      return (
        <View className="items-center gap-sm pt-lg">
          <Text className="text-center text-muted-foreground">
            {waitSeconds === null
              ? t("plans.listLoadError")
              : t("common.rateLimited", { seconds: waitSeconds })}
          </Text>
          <Button
            fill={false}
            label={t("common.tryAgain")}
            onPress={retry}
            variant="secondary"
          />
        </View>
      );
    }
    return (
      <View className="items-center pt-lg" testID="plans-loading">
        <ActivityIndicator colorClassName="accent-foreground" />
      </View>
    );
  };

  return (
    <VStack className="items-stretch">
      {renderPlans()}
      <Link asChild href="/planner">
        <Button label={t("plans.createNew")} />
      </Link>
    </VStack>
  );
}
