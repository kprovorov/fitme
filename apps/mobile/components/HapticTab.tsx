import * as Haptics from "expo-haptics";
import type { BottomTabBarButtonProps } from "expo-router/js-tabs";
import { PlatformPressable } from "expo-router/react-navigation";
import { useCallback } from "react";
import type { GestureResponderEvent } from "react-native";

export function HapticTab(props: BottomTabBarButtonProps) {
  const { onPressIn } = props;

  const handlePressIn = useCallback(
    (ev: GestureResponderEvent) => {
      if (process.env.EXPO_OS === "ios") {
        // Add a soft haptic feedback when pressing down on the tabs.
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onPressIn?.(ev);
    },
    [onPressIn]
  );

  return <PlatformPressable {...props} onPressIn={handlePressIn} />;
}
