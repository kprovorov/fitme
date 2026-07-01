import type { ViewRef } from "@rn-primitives/types";
import type * as React from "react";
import { ScrollView, type ViewProps } from "react-native";
import ExerciseImage from "@/components/exercises/exercise-image";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
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

const WorkoutSessionCard = ({
  className,
  workoutSession,
  ref,
  ...props
}: (ViewProps & WorkoutSessionCardProps) & {
  ref?: React.RefObject<ViewRef | null>;
}) => (
  <Card className={cn("flex gap-4 py-4", className)} ref={ref} {...props}>
    <CardHeader>
      <CardTitle className="text-muted-foreground text-subhead">
        {new Date(workoutSession.started_at).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </CardTitle>
    </CardHeader>
    <HStack className="justify-start gap-3 px-4">
      <Badge>
        <HStack className="gap-1">
          <Zap color="black" size={16} />
          <Text className="text-subhead">
            {workoutSession.exercises.length} Exercises
          </Text>
        </HStack>
      </Badge>
      <Badge>
        <HStack className="gap-1">
          <Timer color="black" size={16} />
          <Text className="text-subhead">
            {formatDuration(
              workoutSession.started_at,
              workoutSession.finished_at
            )}
          </Text>
        </HStack>
      </Badge>
    </HStack>
    <ScrollView
      contentContainerClassName="px-4 gap-2"
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {workoutSession.exercises.map((exercise) => (
        <ExerciseImage exercise={exercise.exercise} key={exercise.id} />
      ))}
    </ScrollView>
  </Card>
);
WorkoutSessionCard.displayName = "WorkoutSessionCard";

export default WorkoutSessionCard;
