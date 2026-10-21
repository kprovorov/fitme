import type { WorkoutData } from "@fitme/core";
import { Link } from "expo-router";
import { Pressable, View } from "react-native";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { H4, Muted } from "@/components/ui/typography";
import { VStack } from "@/components/ui/vstack";
import { SymbolImage } from "~/components/symbol-image";
import { cn } from "~/lib/utils";
import { COUNT_SYMBOL } from "../plans/plan-symbols";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";

interface WorkoutDataCardProps {
  compact?: boolean;
  workoutData: WorkoutData;
}

export default function WorkoutDataCard({
  workoutData,
  compact = false,
}: WorkoutDataCardProps) {
  const content = (
    <VStack
      className={cn(
        "w-full items-stretch",
        compact ? "gap-0 px-3 py-3" : "gap-4"
      )}
    >
      <VStack className={cn("items-stretch", compact ? "gap-2" : "gap-3")}>
        <HStack className="items-center justify-between">
          <H4 className="flex-1 text-primary">{workoutData.name}</H4>
          <Badge variant="secondary">
            <SymbolImage
              className="text-footnote-emphasized text-secondary-foreground"
              name={COUNT_SYMBOL}
            />
            <Text>{workoutData.exercises.length}</Text>
          </Badge>
        </HStack>
        {!compact && <Muted>{workoutData.description}</Muted>}
      </VStack>
      <View
        className={cn("border-white/10 border-t", compact ? "mt-2" : "mt-1")}
      />
      <VStack
        className={cn("items-stretch", compact ? "mt-2 gap-1.5" : "gap-2")}
      >
        {workoutData.exercises.map((exercise) => (
          <Link
            asChild
            href={`/exercises/${exercise.exercise.id}`}
            key={exercise.exercise.id}
          >
            <Pressable className="flex-row items-center justify-between py-0.5 active:opacity-70">
              <HStack className="flex-1 items-center gap-2.5">
                <Text className="w-6 text-right text-mono-footnote text-primary">
                  {exercise.sets.length}×
                </Text>
                <Text
                  className={cn(
                    "flex-1",
                    compact
                      ? "text-subhead-emphasized"
                      : "text-footnote-emphasized"
                  )}
                >
                  {exercise.exercise.name}
                </Text>
              </HStack>
              <SymbolImage
                className={cn(
                  "text-muted-foreground",
                  compact
                    ? "text-subhead-emphasized"
                    : "text-footnote-emphasized"
                )}
                name="chevron.right"
              />
            </Pressable>
          </Link>
        ))}
      </VStack>
    </VStack>
  );

  if (compact) {
    return content;
  }

  return <Card>{content}</Card>;
}
