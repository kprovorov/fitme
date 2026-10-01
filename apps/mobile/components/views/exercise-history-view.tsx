import { getWeightLabel } from "@fitme/core";
import { format } from "date-fns";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { useExerciseHistoryQuery } from "~/hooks/queries/exercises";
import { HStack } from "../ui/hstack";
import { Text } from "../ui/text";
import { H2 } from "../ui/typography";
import { VStack } from "../ui/vstack";

interface ExerciseHistoryViewProps {
  exerciseId: string;
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
        <VStack className="items-stretch gap-0" key={item.id}>
          <HStack className="justify-start py-xs">
            <Text className="font-bold">
              {format(new Date(item.created_at ?? ""), "PPP")}
            </Text>
          </HStack>
          {item.sets
            .sort((a, b) => a.order - b.order)
            .map((set) => (
              <HStack
                className="justify-start border-border border-t px-sm py-xs"
                key={set.id}
              >
                <HStack className="w-8 justify-center">
                  <Text className="text-primary">#{set.order}</Text>
                </HStack>
                <Text className="w-16">
                  {set.weight_completed}{" "}
                  {getWeightLabel(
                    user?.profile?.measurement_system ?? "metric"
                  )}
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
