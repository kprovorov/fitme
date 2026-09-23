import {
  Picker as SwiftUIPicker,
  Text as SwiftUIText,
} from "@expo/ui/swift-ui";
import {
  type PickerStyleType,
  pickerStyle,
  tag,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { SwiftUIHost, useSwiftUITheme } from "~/components/ui/swift-ui";
import { cn } from "~/lib/utils";

type PickerValue = string | number;

interface PickerOption<TValue extends PickerValue> {
  label: string;
  value: TValue;
}

interface PickerProps<TValue extends PickerValue> {
  className?: string;
  /** Shown next to (or above) the control, depending on the style. */
  label?: string;
  onValueChange?: (value: TValue) => void;
  options: PickerOption<TValue>[];
  testID?: string;
  value?: TValue;
  variant?: PickerStyleType;
}

/**
 * A SwiftUI `Picker`. Every selectable option is a SwiftUI `Text` carrying a
 * `tag` modifier — that tag is what SwiftUI reports back on selection, so the
 * option values round-trip as-is.
 */
const Picker = <TValue extends PickerValue>({
  options,
  value,
  onValueChange,
  label,
  variant = "menu",
  className,
  testID,
}: PickerProps<TValue>) => {
  const theme = useSwiftUITheme();

  const isWheel = variant === "wheel";

  return (
    <SwiftUIHost
      className={cn(isWheel ? "h-52 flex-1" : "w-full", className)}
      matchContents={isWheel ? undefined : { vertical: true }}
    >
      <SwiftUIPicker
        label={label}
        modifiers={[pickerStyle(variant), tint(theme.primary)]}
        onSelectionChange={(selection) => onValueChange?.(selection as TValue)}
        selection={value ?? null}
        testID={testID}
      >
        {options.map((option) => (
          <SwiftUIText key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </SwiftUIText>
        ))}
      </SwiftUIPicker>
    </SwiftUIHost>
  );
};

Picker.displayName = "Picker";

export type { PickerOption, PickerProps, PickerValue };
export { Picker };
