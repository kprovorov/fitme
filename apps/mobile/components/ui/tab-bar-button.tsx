import * as Haptics from "expo-haptics";
import type { TabTriggerSlotProps } from "expo-router/ui";
import type React from "react";
import { Pressable, Text, type ViewInstance } from "react-native";
import { VStack } from "./vstack";

interface TabBarButtonProps
  extends React.PropsWithChildren,
    Omit<TabTriggerSlotProps, "ref"> {
  renderIcon: (props: { isFocused: boolean }) => React.ReactNode;
}

const triggerHaptics = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
};

export const TabBarButton = ({
  ref,
  ...props
}: TabBarButtonProps & { ref?: React.Ref<ViewInstance> }) => (
  <Pressable ref={ref} {...props} onPressIn={triggerHaptics}>
    <VStack className="w-12 items-center justify-center gap-1">
      {props.renderIcon({ isFocused: props.isFocused ?? false })}
      <Text className="font-nunito-sans-bold text-footnote text-white">
        {props.children}
      </Text>
    </VStack>
  </Pressable>
);

TabBarButton.displayName = "TabBarButton";
