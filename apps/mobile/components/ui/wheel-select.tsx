import { useState } from "react";
import { TouchableWithoutFeedback } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { HStack } from "~/components/ui/hstack";
import { Picker, type PickerOption } from "~/components/ui/picker";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";

const WHEEL_HEIGHT = 200;

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

  const wheelHeight = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    height: wheelHeight.value,
  }));

  const toggleWheel = () => {
    const next = !isFocused;
    setIsFocused(next);
    wheelHeight.value = withTiming(next ? WHEEL_HEIGHT : 0, { duration: 300 });
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
          {wheels.map((wheel) => (
            <Picker
              className="h-full flex-1"
              key={wheel.options.map((option) => option.value).join(",")}
              onValueChange={wheel.onValueChange}
              options={wheel.options}
              value={wheel.selectedValue}
              variant="wheel"
            />
          ))}
        </HStack>
      </Animated.View>
    </VStack>
  );
};

WheelSelect.displayName = "WheelSelect";

export type { Wheel, WheelSelectProps };
export { WheelSelect };
