import { useCallback, useState } from "react";
import { TouchableWithoutFeedback } from "react-native";
import type { GestureResponderEvent } from "react-native";
import Animated, { withTiming } from "react-native-reanimated";
import type { LayoutAnimationFunction } from "react-native-reanimated";

import { HStack } from "~/components/ui/hstack";
import { Picker } from "~/components/ui/picker";
import type { PickerOption } from "~/components/ui/picker";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";

const wheelTransition: LayoutAnimationFunction = (values) => {
  "worklet";

  return {
    initialValues: { height: values.currentHeight },
    animations: { height: withTiming(values.targetHeight, { duration: 300 }) },
  };
};

interface Wheel {
  onValueChange?: (value: string) => void;
  options: PickerOption<string>[];
  selectedValue?: string;
}

interface WheelSelectProps {
  label: string;
  value: string;
  wheels: Wheel[];
}

const WheelSelect = ({ label, wheels, value }: WheelSelectProps) => {
  const [isFocused, setIsFocused] = useState(false);

  const toggleWheel = useCallback(() => {
    setIsFocused((focused) => !focused);
  }, []);

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      e.stopPropagation();
      toggleWheel();
    },
    [toggleWheel]
  );

  return (
    <VStack className="bg-card flex-1 items-stretch gap-0 p-0">
      <TouchableWithoutFeedback onPress={handlePress}>
        <HStack className="h-12 flex-1 justify-between px-3">
          <Text>{label}</Text>
          <Text className="text-primary text-right">{value}</Text>
        </HStack>
      </TouchableWithoutFeedback>

      <Animated.View
        className={isFocused ? "h-50 overflow-hidden" : "h-0 overflow-hidden"}
        layout={wheelTransition}
      >
        <HStack className="border-border gap-0 border-t">
          {wheels.map(
            ({ onValueChange: handleValueChange, options, selectedValue }) => (
              <Picker
                className="h-full flex-1"
                key={options.map((option) => option.value).join(",")}
                onValueChange={handleValueChange}
                options={options}
                value={selectedValue}
                variant="wheel"
              />
            )
          )}
        </HStack>
      </Animated.View>
    </VStack>
  );
};

WheelSelect.displayName = "WheelSelect";

export type { Wheel, WheelSelectProps };

export { WheelSelect };
