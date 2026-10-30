import { useTranslation } from "react-i18next";
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
  /**
   * Continue's look: the screen's primary action by default, `secondary`
   * where another lime action already opens the session (Home's timer).
   */
  variant?: "default" | "secondary";
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
  variant = "default",
}: BlockedStartProps) {
  const { t } = useTranslation();
  const name = blockedBy.workoutName;
  return (
    <View className="gap-xs">
      <Button
        disabled
        label={t("startWorkout.start")}
        size={size}
        testID="start-workout-button"
      />
      <Text className="text-center text-footnote text-muted-foreground">
        {name
          ? t("startWorkout.finishFirstNamed", { name })
          : t("startWorkout.finishFirst")}
      </Text>
      <Button
        icon="arrow.right"
        iconPosition="trailing"
        label={
          name
            ? t("startWorkout.continueNamed", { name })
            : t("startWorkout.continue")
        }
        onPress={onContinue}
        size={size}
        variant={variant}
      />
    </View>
  );
}
