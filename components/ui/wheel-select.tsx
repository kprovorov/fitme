import { Picker, type PickerProps } from "@react-native-picker/picker";
import type * as React from "react";
import { useState } from "react";
import {
  type TextInput,
  type TextInputProps,
  TouchableWithoutFeedback,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { HStack } from "~/components/ui/hstack";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";

type Wheel = PickerProps & { options: { label: string; value: string }[] };

interface WheelSelectProps extends TextInputProps {
  label: string;
  value: string;
  wheels: Wheel[];
}

const WheelSelect = ({
  label,
  wheels,
  value,
  ref: _,
}: WheelSelectProps & {
  ref?: React.RefObject<React.ElementRef<typeof TextInput> | null>;
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const wheelHeight = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    height: wheelHeight.value,
  }));

  const toggleWheel = () => {
    const next = !isFocused;
    setIsFocused(next);
    wheelHeight.value = withTiming(next ? 200 : 0, { duration: 300 });
  };

  return (
    <VStack className="flex-1 items-stretch gap-0 bg-black/30 p-0">
      <TouchableWithoutFeedback
        onPress={(e) => {
          e.stopPropagation();
          toggleWheel();
        }}
      >
        <HStack className="h-12 flex-1 justify-between px-3">
          <Text>{label}</Text>
          <Text className="text-right text-primary">{value}</Text>
        </HStack>
      </TouchableWithoutFeedback>

      <Animated.View className="overflow-hidden" style={[animatedStyle]}>
        <HStack className="gap-0 border-foreground/10 border-t">
          {wheels.map((wheel, index) => (
            <Picker
              className="flex-1 border-2"
              key={wheel.selectedValue?.toString() ?? index}
              onValueChange={(itemValue, itemIndex) => {
                wheel.onValueChange?.(itemValue, itemIndex);
              }}
              selectedValue={wheel.selectedValue}
              style={{ flex: 1 }}
              {...wheel}
            >
              {wheel.options.map((option) => (
                <Picker.Item
                  key={option.value}
                  label={option.label}
                  value={option.value}
                />
              ))}
            </Picker>
          ))}
        </HStack>
      </Animated.View>
    </VStack>
  );
};

WheelSelect.displayName = "WheelSelect";

export { WheelSelect };
