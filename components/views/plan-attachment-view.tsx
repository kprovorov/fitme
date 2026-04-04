import React, { useState } from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import { MessageAttachment, Plan } from "~/lib/models";
import { useStorePlanMutation } from "~/hooks/queries/plans";
import { useIsProQuery } from "~/hooks/revenueCat";
import { IS_E2E } from "~/lib/constants";
import PlanDataView from "./plan-data-view";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { Spinner } from "~/components/ui/spinner";

type Props = {
  attachment: MessageAttachment;
};

export default function PlanAttachmentView({ attachment }: Props) {
  const queryClient = useQueryClient();
  const { data: isPro } = useIsProQuery();
  const [savedPlan, setSavedPlan] = useState<Plan | null>(null);

  const { mutate: storePlan, isPending } = useStorePlanMutation({
    onSuccess: (plan) => {
      setSavedPlan(plan);
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });

  const handleSave = async () => {
    if (isPro || IS_E2E) {
      storePlan(attachment.data);
    } else {
      const result = await RevenueCatUI.presentPaywall();
      if ([PAYWALL_RESULT.PURCHASED, PAYWALL_RESULT.RESTORED].includes(result)) {
        storePlan(attachment.data);
      }
    }
  };

  return (
    <View className="mt-2 w-full border border-white/15 rounded-xl overflow-hidden">
      <PlanDataView planData={attachment.data} />
      <View className="px-4 py-3 border-t border-white/10 flex-row gap-2">
        {savedPlan ? (
          <Link href={`/plans/${savedPlan.id}` as `/plans/${string}`} asChild>
            <Button variant="outline" size="sm" className="flex-1">
              <Text>View Plan</Text>
            </Button>
          </Link>
        ) : (
          <Button
            size="sm"
            className="flex-1"
            disabled={isPending}
            onPress={handleSave}
          >
            {isPending ? (
              <Spinner size={14} className="text-primary-foreground" />
            ) : (
              <Text>Save Plan</Text>
            )}
          </Button>
        )}
      </View>
    </View>
  );
}
