import { format } from "date-fns";
import React from "react";
import { useExerciseHistoryQuery } from "~/hooks/queries/exercises";
import { HStack } from "../ui/hstack";
import { Text } from "../ui/text";
import { H2, H3, H4 } from "../ui/typography";
import { VStack } from "../ui/vstack";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { getWeightLabel } from "~/lib/labels";

interface ExerciseHistoryViewProps {
  exerciseId: number;
}

export default function ExerciseHistoryView({
  exerciseId,
}: ExerciseHistoryViewProps) {
  const { data: items } = useExerciseHistoryQuery({
    variables: {
      exerciseId,
    },
  });

  const { data: user } = useCurrentUserQuery();

  return (
    <VStack className="items-stretch">
      <H2>History</H2>

      {items?.map((item) => (
        <VStack key={item.id} className="items-stretch gap-0">
          <HStack className="justify-start py-xs">
            <Text className="font-bold">
              {format(new Date(item.created_at!), "PPP")}
            </Text>
          </HStack>
          {item.sets.map((set) => (
            <HStack
              key={set.id}
              className="border-t border-border py-xs justify-start px-sm"
            >
              <HStack className="w-8 justify-center">
                <Text className="text-primary">#{set.order}</Text>
              </HStack>
              <Text className="w-16">
                {set.weight_completed}{" "}
                {getWeightLabel(user!.measurement_system)}
              </Text>
              <Text className="text-muted-foreground">
                x {set.reps_completed} reps
              </Text>
            </HStack>
          ))}
        </VStack>
      ))}
    </VStack>
  );
}
