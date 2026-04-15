import { useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";
import { Text } from "~/components/ui/text";
import { useActivatePlanMutation } from "~/hooks/queries/plans";
import type { MessageAttachment } from "~/lib/models";
import PlanDataView from "./plan-data-view";

interface Props {
  attachment: MessageAttachment;
}

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
    <Card className="mt-2 w-full self-stretch overflow-hidden">
      <PlanDataView compact planData={attachment.data} />
      <View className="flex-row gap-2 border-white/10 border-t px-4 py-3">
        {activated ? (
          <Link
            asChild
            href={`/plans/${attachment.planId}` as `/plans/${string}`}
          >
            <Button className="flex-1" size="sm" variant="outline">
              <Text>View Plan</Text>
            </Button>
          </Link>
        ) : (
          <Button
            className="flex-1"
            disabled={isPending}
            onPress={() => activatePlan({ id: attachment.planId })}
            size="sm"
          >
            {isPending ? (
              <Spinner className="text-primary-foreground" size={14} />
            ) : (
              <Text>Activate Plan</Text>
            )}
          </Button>
        )}
      </View>
    </Card>
  );
}
