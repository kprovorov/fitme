import {
  Divider,
  Menu,
  RNHostView,
  Button as SwiftUIButton,
  Image as SwiftUIImage,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as accessibilityLabelModifier,
  contentShape,
  frame,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import type * as React from "react";
import type { SFSymbol } from "sf-symbols-typescript";
import { SwiftUIHost, useSwiftUITheme } from "~/components/ui/swift-ui";

interface DropdownMenuItem {
  destructive?: boolean;
  label: string;
  onPress?: () => void;
  /** Draws a separator above this item. */
  startsSection?: boolean;
  systemImage?: SFSymbol;
}

interface DropdownMenuProps {
  /** VoiceOver label for the menu button; required for an icon-only menu. */
  accessibilityLabel?: string;
  /**
   * React Native content used as the menu button. Takes precedence over
   * `label`/`systemImage`.
   */
  children?: React.ReactNode;
  className?: string;
  items: DropdownMenuItem[];
  /** Text label for the button that opens the menu. */
  label?: string;
  /** Fires on a plain tap; long press then opens the menu. */
  onPrimaryAction?: () => void;
  systemImage?: SFSymbol;
  testID?: string;
}

/** Apple HIG minimum tappable size, in points. */
const MIN_HIT_TARGET_SIZE = 44;

const DropdownMenu = ({
  accessibilityLabel,
  items,
  label,
  systemImage,
  children,
  onPrimaryAction,
  className,
  testID,
}: DropdownMenuProps) => {
  const theme = useSwiftUITheme();

  // SwiftUI's `Menu` only honours `systemImage` alongside a text label, so an
  // icon-only menu has to supply its button as a label view instead.
  const menuLabel = () => {
    if (children) {
      return (
        <RNHostView matchContents>{children as React.ReactElement}</RNHostView>
      );
    }
    if (label) {
      return label;
    }
    return (
      <SwiftUIImage
        color={theme.foreground}
        modifiers={[
          frame({ height: MIN_HIT_TARGET_SIZE, width: MIN_HIT_TARGET_SIZE }),
          contentShape(shapes.rectangle()),
        ]}
        systemName={systemImage}
      />
    );
  };

  return (
    <SwiftUIHost className={className} matchContents>
      <Menu
        label={menuLabel()}
        modifiers={
          accessibilityLabel
            ? [accessibilityLabelModifier(accessibilityLabel)]
            : undefined
        }
        onPrimaryAction={onPrimaryAction}
        systemImage={label ? systemImage : undefined}
        testID={testID}
      >
        {items.flatMap((item) => [
          ...(item.startsSection
            ? [<Divider key={`${item.label}-divider`} />]
            : []),
          <SwiftUIButton
            key={item.label}
            label={item.label}
            onPress={item.onPress}
            role={item.destructive ? "destructive" : "default"}
            systemImage={item.systemImage}
          />,
        ])}
      </Menu>
    </SwiftUIHost>
  );
};

DropdownMenu.displayName = "DropdownMenu";

export type { DropdownMenuItem, DropdownMenuProps };
export { DropdownMenu };
