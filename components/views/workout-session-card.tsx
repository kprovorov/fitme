import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { H4, P } from "@/components/ui/typography";
import { VStack } from "@/components/ui/vstack";
import { Zap } from "@/lib/icons/Zap";
import type { WorkoutSession } from "~/lib/models";
import { Card } from "../ui/card";

interface WorkoutSessionCardProps {
  workoutSession: WorkoutSession;
}

export default function WorkoutSessionCard({
  workoutSession,
}: WorkoutSessionCardProps) {
  return (
    <Card>
      <VStack className="w-full flex-shrink items-stretch gap-4 p-4">
        <H4 className={"font-nunito-sans-bold text-primary"}>
          {workoutSession.workout.name}
        </H4>
        <HStack className="justify-start">
          <HStack className="gap-1">
            <Zap color="#808080" size={16} />
            <Text className="font-nunito-sans-bold text-sm">
              {workoutSession.exercises.length} Exercises
            </Text>
          </HStack>
        </HStack>
        <P className="text-left text-muted-foreground text-sm">
          {workoutSession.workout.description}
        </P>
      </VStack>
    </Card>
  );
}
