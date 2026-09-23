import { Toggle } from "@expo/ui/swift-ui";
import { labelsHidden, tint } from "@expo/ui/swift-ui/modifiers";
import { SwiftUIHost, useSwiftUITheme } from "~/components/ui/swift-ui";

interface SwitchProps {
  className?: string;
  /** Rendered leading the switch. Omit for a bare control. */
  label?: string;
  onValueChange?: (value: boolean) => void;
  testID?: string;
  value?: boolean;
}

const Switch = ({
  value,
  onValueChange,
  label,
  className,
  testID,
}: SwitchProps) => {
  const theme = useSwiftUITheme();

  return (
    <SwiftUIHost className={className} matchContents>
      <Toggle
        isOn={value}
        label={label ?? ""}
        modifiers={
          label ? [tint(theme.primary)] : [tint(theme.primary), labelsHidden()]
        }
        onIsOnChange={onValueChange}
        testID={testID}
      />
    </SwiftUIHost>
  );
};

Switch.displayName = "Switch";

export type { SwitchProps };
export { Switch };
