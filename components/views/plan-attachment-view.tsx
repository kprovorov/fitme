import React, { useState } from "react";
import { View } from "react-native";
import { Link } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { MessageAttachment } from "~/lib/models";
import { useActivatePlanMutation } from "~/hooks/queries/plans";
import PlanDataView from "./plan-data-view";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { Spinner } from "~/components/ui/spinner";

type Props = {
  attachment: MessageAttachment;
};

export default function PlanAttachmentView({ attachment }: Props) {
  const queryClient = useQueryClient();
  const [activated, setActivated] = useState(false);

  const { mutate: activatePlan, isPending } = useActivatePlanMutation({
    onSuccess: () => {
      setActivated(true);
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });

  return (
    <View className="mt-2 w-full self-stretch border border-white/15 rounded-xl overflow-hidden">
      <PlanDataView planData={attachment.data} />
      <View className="px-4 py-3 border-t border-white/10 flex-row gap-2">
        {activated ? (
          <Link
            href={`/plans/${attachment.planId}` as `/plans/${string}`}
            asChild
          >
            <Button variant="outline" size="sm" className="flex-1">
              <Text>View Plan</Text>
            </Button>
          </Link>
        ) : (
          <Button
            size="sm"
            className="flex-1"
            disabled={isPending}
            onPress={() => activatePlan({ id: attachment.planId })}
          >
            {isPending ? (
              <Spinner size={14} className="text-primary-foreground" />
            ) : (
              <Text>Activate Plan</Text>
            )}
          </Button>
        )}
      </View>
    </View>
  );
}
