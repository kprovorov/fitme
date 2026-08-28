import { Slider as SwiftUISlider } from "@expo/ui/swift-ui";
import { tint } from "@expo/ui/swift-ui/modifiers";
import { SwiftUIHost, useSwiftUITheme } from "~/components/ui/swift-ui";
import { cn } from "~/lib/utils";

interface SliderProps {
  className?: string;
  max?: number;
  min?: number;
  onEditingChanged?: (isEditing: boolean) => void;
  onValueChange?: (value: number) => void;
  step?: number;
  testID?: string;
  value?: number;
}

const Slider = ({
  value,
  min,
  max,
  step,
  onValueChange,
  onEditingChanged,
  className,
  testID,
}: SliderProps) => {
  const theme = useSwiftUITheme();

  return (
    <SwiftUIHost
      className={cn("h-10 w-full", className)}
      matchContents={{ vertical: true }}
    >
      <SwiftUISlider
        max={max}
        min={min}
        modifiers={[tint(theme.primary)]}
        onEditingChanged={onEditingChanged}
        onValueChange={onValueChange}
        step={step}
        testID={testID}
        value={value}
      />
    </SwiftUIHost>
  );
};

Slider.displayName = "Slider";

export type { SliderProps };
export { Slider };
