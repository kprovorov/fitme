import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { TabTriggerSlotProps } from "expo-router/ui";
import { VStack } from "./vstack";

interface TabBarButtonProps
  extends React.PropsWithChildren,
    TabTriggerSlotProps {
  renderIcon: (props: { isFocused: boolean }) => React.ReactNode;
}

export const TabBarButton = React.forwardRef<View, TabBarButtonProps>(
  (props, ref) => {
    return (
      <Pressable ref={ref} {...props}>
        <VStack className="gap-1">
          {props.renderIcon({ isFocused: props.isFocused ?? false })}
          <Text className="text-white text-sm font-nunito-sans-bold">{props.children}</Text>
        </VStack>
      </Pressable>
    );
  }
);

TabBarButton.displayName = "TabBarButton";
