import { View } from "react-native";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import type { OpenWorkoutSession } from "~/hooks/queries/workout-sessions";

interface BlockedStartProps {
  /** Another Workout's open Workout Session, which Start waits on. */
  blockedBy: OpenWorkoutSession;
  /** Opens `blockedBy`'s Workout Session. */
  onContinue: () => void;
  size?: "default" | "lg";
}

/**
 * Start while another Workout is in progress (a User has at most one open
 * Workout Session, ADR 0013): Start disabled, which Workout to finish first,
 * and a button continuing it. The Workout screen and the Next card on Home
 * both show it.
 */
export function BlockedStart({
  blockedBy,
  onContinue,
  size = "default",
}: BlockedStartProps) {
  const name = blockedBy.workoutName;
  return (
    <View className="gap-xs">
      <Button
        disabled
        icon="arrow.right"
        iconPosition="trailing"
        label="Start Workout"
        size={size}
        testID="start-workout-button"
      />
      <Text className="text-center text-footnote text-muted-foreground">
        {name
          ? `Finish ${name} first`
          : "Finish your workout in progress first"}
      </Text>
      <Button
        icon="arrow.right"
        iconPosition="trailing"
        label={name ? `Continue ${name}` : "Continue Workout"}
        onPress={onContinue}
        size={size}
      />
    </View>
  );
}
