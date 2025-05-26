import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { TabTriggerSlotProps } from "expo-router/ui";
import { VStack } from "./vstack";
import * as Haptics from "expo-haptics";

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
        <VStack className="gap-1 w-12 items-center justify-center">
          {props.renderIcon({ isFocused: props.isFocused ?? false })}
          <Text className="text-white text-xs font-nunito-sans-bold">
            {props.children}
          </Text>
        </VStack>
      </Pressable>
    );
  },
);

TabBarButton.displayName = "TabBarButton";
