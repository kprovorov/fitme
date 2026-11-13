import {
  HStack,
  Image as SwiftUIImage,
  Menu,
  Picker as SwiftUIPicker,
  Text as SwiftUIText,
} from "@expo/ui/swift-ui";
import {
  buttonStyle,
  contentShape,
  foregroundStyle,
  font,
  frame,
  menuIndicator,
  menuStyle,
  pickerStyle,
  shapes,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { useCallback } from "react";

import { SwiftUIHost, useSwiftUITheme } from "~/components/ui/swift-ui";
import { cn } from "~/lib/utils";

import type { PickerProps, PickerValue } from "./picker";

/** Apple HIG minimum tappable size, in points. */
const MIN_HIT_TARGET_SIZE = 44;

type SelectProps<TValue extends PickerValue> = Omit<
  PickerProps<TValue>,
  "label" | "variant"
>;

/**
 * A dropdown selection: the chosen option's label with an up-down chevron,
 * opening a native menu of the options with a checkmark on the chosen one.
 *
 * It's a SwiftUI `Menu` around an inline `Picker` rather than a menu-style
 * `Picker`, because that one's button keeps a system inset before its value
 * (12 pt at the default text size, growing with Dynamic Type), so the value
 * never lined up with the text around it. A plain `Menu` draws only the label
 * it's given, which starts flush (FIT-637).
 */
const Select = <TValue extends PickerValue>({
  className,
  onValueChange,
  options,
  testID,
  value,
}: SelectProps<TValue>) => {
  const theme = useSwiftUITheme();

  const handleSelectionChange = useCallback(
    // SAFETY: SwiftUI reports a selected option's tag, and every option tag is a TValue.
    (selection: TValue | null) => onValueChange?.(selection as TValue),
    [onValueChange]
  );

  const chosen = options.find((option) => option.value === value);

  return (
    <SwiftUIHost
      className={cn("w-full", className)}
      matchContents={{ vertical: true }}
    >
      <Menu
        label={
          <HStack
            modifiers={[
              foregroundStyle(theme.primary),
              // The label is the whole button: at least Apple's 44 pt tall.
              frame({ alignment: "leading", minHeight: MIN_HIT_TARGET_SIZE }),
              contentShape(shapes.rectangle()),
            ]}
            spacing={4}
          >
            <SwiftUIText>{chosen?.label ?? ""}</SwiftUIText>
            <SwiftUIImage
              // Smaller than the value, as a menu Picker draws it, and scaling
              // with Dynamic Type alongside it.
              modifiers={[font({ textStyle: "footnote", weight: "semibold" })]}
              systemName="chevron.up.chevron.down"
            />
          </HStack>
        }
        modifiers={[
          menuStyle("button"),
          buttonStyle("plain"),
          menuIndicator("hidden"),
        ]}
        testID={testID}
      >
        <SwiftUIPicker
          label=""
          modifiers={[pickerStyle("inline")]}
          onSelectionChange={handleSelectionChange}
          selection={value ?? null}
        >
          {options.map((option) => (
            <SwiftUIText key={option.value} modifiers={[tag(option.value)]}>
              {option.label}
            </SwiftUIText>
          ))}
        </SwiftUIPicker>
      </Menu>
    </SwiftUIHost>
  );
};

Select.displayName = "Select";

export type { SelectProps };

export { Select };
