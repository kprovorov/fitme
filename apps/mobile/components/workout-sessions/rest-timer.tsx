import { formatElapsed } from "@fitme/core";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect } from "react";
import { AccessibilityInfo, type LayoutChangeEvent, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  useReducedMotion,
} from "react-native-reanimated";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useNow } from "~/hooks/use-now";

export interface Rest {
  /** Seconds the rest was started with, for the progress bar. */
  duration: number;
  endsAt: number;
  /** The set to do next, if the exercise has one. */
  nextSetOrder: number | null;
}

interface RestTimerProps {
  bottomInset: number;
  onAdjust: (seconds: number) => void;
  onEnd: () => void;
  /** Reports the timer's height, so the content can scroll clear of it. */
  onLayout?: (event: LayoutChangeEvent) => void;
  rest: Rest;
}

const ADJUST_STEP_SECONDS = 15;

const ENTER_MS = 200;
const EXIT_MS = 150;

/**
 * A countdown floating above the sets after one is logged: adds or removes 15
 * seconds, skips, and taps the phone when the rest is over.
 */
export default function RestTimer({
  bottomInset,
  onAdjust,
  onEnd,
  onLayout,
  rest,
}: RestTimerProps) {
  // Reduced motion keeps the fade and drops the slide.
  const reduceMotion = useReducedMotion();
  const entering = (reduceMotion ? FadeIn : FadeInDown).duration(ENTER_MS);
  const exiting = (reduceMotion ? FadeOut : FadeOutDown).duration(EXIT_MS);
  const lessRest = useCallback(
    () => onAdjust(-ADJUST_STEP_SECONDS),
    [onAdjust]
  );
  const moreRest = useCallback(() => onAdjust(ADJUST_STEP_SECONDS), [onAdjust]);
  const now = useNow(true, 250);
  const remaining = Math.max(0, rest.endsAt - now);
  const isOver = remaining === 0;

  useEffect(() => {
    if (isOver) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      AccessibilityInfo.announceForAccessibility("Rest over");
      onEnd();
    }
  }, [isOver, onEnd]);

  // Rounded up, so the clock reads 0:00 only when the rest is over.
  const clock = formatElapsed(Math.ceil(remaining / 1000) * 1000);
  const fraction = Math.min(1, remaining / (rest.duration * 1000));

  return (
    <Animated.View
      className="absolute inset-x-sm"
      entering={entering}
      exiting={exiting}
      onLayout={onLayout}
      style={{ bottom: bottomInset + 8 }}
    >
      <View className="overflow-hidden rounded-3xl border border-border border-continuous bg-secondary">
        <View className="h-0.5 bg-foreground/10">
          <View
            className="h-0.5 w-full bg-primary"
            style={{
              transform: [{ scaleX: fraction }],
              transformOrigin: "left",
            }}
          />
        </View>
        <View className="flex-row flex-wrap items-center gap-2 py-2.5 pr-3 pl-5">
          <View
            accessibilityLabel={`Rest, ${clock} left`}
            accessibilityLiveRegion="polite"
            accessible
            className="min-w-24 flex-1"
          >
            <Text className="text-footnote text-muted-foreground">
              {rest.nextSetOrder
                ? `Rest · then set ${rest.nextSetOrder}`
                : "Rest"}
            </Text>
            <Text className="text-mono-title-2-semibold">{clock}</Text>
          </View>
          <Button
            accessibilityLabel="15 seconds less"
            fill={false}
            label={`−${ADJUST_STEP_SECONDS}`}
            onPress={lessRest}
            shape="pill"
            variant="secondary"
          />
          <Button
            accessibilityLabel="15 seconds more"
            fill={false}
            label={`+${ADJUST_STEP_SECONDS}`}
            onPress={moreRest}
            shape="pill"
            variant="secondary"
          />
          <Button
            accessibilityLabel="Skip rest"
            fill={false}
            label="Skip"
            onPress={onEnd}
            shape="pill"
            variant="secondary"
          />
        </View>
      </View>
    </Animated.View>
  );
}
