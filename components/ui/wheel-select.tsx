import * as React from "react";
import {
  TextInput,
  TouchableWithoutFeedback,
  type TextInputProps,
} from "react-native";
import { VStack } from "~/components/ui/vstack";
import { HStack } from "~/components/ui/hstack";
import { Text } from "~/components/ui/text";
import { Picker, PickerProps } from "@react-native-picker/picker";
import { useState } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

type Wheel = PickerProps & { options: { label: string; value: string }[] };

interface WheelSelectProps extends TextInputProps {
  label: string;
  value: string;
  wheels: Wheel[];
}

const WheelSelect = React.forwardRef<
  React.ElementRef<typeof TextInput>,
  WheelSelectProps
>(
  (
    { className, placeholderClassName, label, wheels, value, ...props },
    ref
  ) => {
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
      <VStack className="items-stretch flex-1 bg-black/30 p-0 gap-0">
        <TouchableWithoutFeedback
          onPress={(e) => {
            e.stopPropagation();
            toggleWheel();
          }}
        >
          <HStack className="flex-1 justify-between h-12 px-3">
            <Text>{label}</Text>
            <Text className="text-right text-primary">{value}</Text>
          </HStack>
        </TouchableWithoutFeedback>

        <Animated.View style={[animatedStyle]} className="overflow-hidden">
          <HStack className="gap-0 border-t border-foreground/10">
            {wheels.map((wheel, index) => (
              <Picker
                key={index}
                style={{ flex: 1 }}
                selectedValue={wheel.selectedValue}
                onValueChange={(itemValue, itemIndex) => {
                  wheel.onValueChange?.(itemValue, itemIndex);
                }}
                className="flex-1 border-2"
                {...wheel}
              >
                {wheel.options.map((option) => (
                  <Picker.Item
                    label={option.label}
                    value={option.value}
                    key={option.value}
                  />
                ))}
              </Picker>
            ))}
          </HStack>
        </Animated.View>
      </VStack>
    );
  }
);

WheelSelect.displayName = "WheelSelect";

export { WheelSelect };
