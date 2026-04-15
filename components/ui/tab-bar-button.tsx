import * as Haptics from "expo-haptics";
import type { TabTriggerSlotProps } from "expo-router/ui";
import React from "react";
import { Pressable, Text, type View } from "react-native";
import { VStack } from "./vstack";

interface TabBarButtonProps
  extends React.PropsWithChildren,
    TabTriggerSlotProps {
  renderIcon: (props: { isFocused: boolean }) => React.ReactNode;
}

export const TabBarButton = React.forwardRef<View, TabBarButtonProps>(
  (props, ref) => {
    return (
      <Pressable
        ref={ref}
        {...props}
        onPressIn={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
        }}
      >
        <VStack className="w-12 items-center justify-center gap-1">
          {props.renderIcon({ isFocused: props.isFocused ?? false })}
          <Text className="font-nunito-sans-bold text-white text-xs">
            {props.children}
          </Text>
        </VStack>
      </Pressable>
    );
  }
);

TabBarButton.displayName = "TabBarButton";
