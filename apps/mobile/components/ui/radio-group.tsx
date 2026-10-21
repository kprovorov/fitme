import {
  Form,
  Section,
  Picker as SwiftUIPicker,
  Text as SwiftUIText,
} from "@expo/ui/swift-ui";
import {
  disabled as disabledModifier,
  foregroundStyle,
  listRowBackground,
  listRowSeparatorTint,
  pickerStyle,
  scrollContentBackground,
  tag,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useCallback } from "react";
import { SwiftUIHost, useSwiftUITheme } from "~/components/ui/swift-ui";
import { cn } from "~/lib/utils";
import type { PickerOption, PickerValue } from "./picker";

interface RadioGroupProps<TValue extends PickerValue> {
  className?: string;
  /** Greys the options out and ignores taps. */
  disabled?: boolean;
  /** Explanatory text below the options. */
  footer?: string;
  /** Section header above the options. */
  label?: string;
  onValueChange?: (value: TValue) => void;
  options: PickerOption<TValue>[];
  testID?: string;
  value?: TValue;
}

/**
 * A single-choice list — SwiftUI's inline `Picker`, which renders the familiar
 * iOS checkmark rows.
 *
 * The inline style only draws itself inside a `List` or `Form`, and a `Form`
 * expands to fill its container, so this owns a full-height host. Give it a
 * parent with real height (a `flex-1` view, not a scroll view's content).
 */
const RadioGroup = <TValue extends PickerValue>({
  options,
  value,
  onValueChange,
  label,
  footer,
  className,
  disabled = false,
  testID,
}: RadioGroupProps<TValue>) => {
  const theme = useSwiftUITheme();

  const handleSelectionChange = useCallback(
    (selection: TValue | null) => onValueChange?.(selection as TValue),
    [onValueChange]
  );

  return (
    <SwiftUIHost className={cn("flex-1", className)} useViewportSizeMeasurement>
      {/* The checkmark takes the Form's tint: on the inline Picker itself it
          stays the system blue. */}
      <Form
        modifiers={[scrollContentBackground("hidden"), tint(theme.primary)]}
      >
        <Section
          footer={
            footer ? (
              <SwiftUIText modifiers={[foregroundStyle(theme.mutedForeground)]}>
                {footer}
              </SwiftUIText>
            ) : undefined
          }
          header={
            label ? (
              <SwiftUIText modifiers={[foregroundStyle(theme.mutedForeground)]}>
                {label}
              </SwiftUIText>
            ) : undefined
          }
        >
          <SwiftUIPicker
            modifiers={[
              pickerStyle("inline"),
              listRowBackground(theme.card),
              listRowSeparatorTint(theme.border),
              disabledModifier(disabled),
            ]}
            onSelectionChange={handleSelectionChange}
            selection={value ?? null}
            testID={testID}
          >
            {options.map((option) => (
              <SwiftUIText key={option.value} modifiers={[tag(option.value)]}>
                {option.label}
              </SwiftUIText>
            ))}
          </SwiftUIPicker>
        </Section>
      </Form>
    </SwiftUIHost>
  );
};

RadioGroup.displayName = "RadioGroup";

export type { RadioGroupProps };
export { RadioGroup };
