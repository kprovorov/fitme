import type { ViewRef } from "@rn-primitives/types";
import * as React from "react";
import type { ViewProps } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { Timer } from "@/lib/icons/Timer";
import { Zap } from "@/lib/icons/Zap";
import type { WorkoutSession } from "@/lib/models";
import { cn } from "@/lib/utils";

function formatDuration(startedAt: string, finishedAt: string): string {
  const minutes = Math.round(
    (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60_000
  );
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

interface WorkoutSessionCardProps {
  workoutSession: WorkoutSession;
}

const WorkoutSessionCard = React.forwardRef<
  ViewRef,
  ViewProps & WorkoutSessionCardProps
>(({ className, workoutSession, ...props }, ref) => (
  <Card className={cn(className)} ref={ref} {...props}>
    <VStack className="w-full flex-shrink items-stretch gap-4 p-4">
      <Text className="text-muted-foreground text-sm">
        {new Date(workoutSession.started_at).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </Text>
      <HStack className="justify-start gap-3">
        <Badge>
          <HStack className="gap-1">
            <Zap color="black" size={16} />
            <Text className="text-sm">
              {workoutSession.exercises.length} Exercises
            </Text>
          </HStack>
        </Badge>
        <Badge>
          <HStack className="gap-1">
            <Timer color="black" size={16} />
            <Text className="text-sm">
              {formatDuration(
                workoutSession.started_at,
                workoutSession.finished_at
              )}
            </Text>
          </HStack>
        </Badge>
      </HStack>
    </VStack>
  </Card>
));
WorkoutSessionCard.displayName = "WorkoutSessionCard";

export default WorkoutSessionCard;
