import {
  Divider,
  Menu,
  RNHostView,
  Button as SwiftUIButton,
  Image as SwiftUIImage,
  Label as SwiftUILabel,
  Text as SwiftUIText,
} from "@expo/ui/swift-ui";
import * as menuModifiers from "@expo/ui/swift-ui/modifiers";
import type * as React from "react";
import type { SFSymbol } from "sf-symbols-typescript";

import {
  SwiftUIHost,
  useClassColor,
  useSwiftUITheme,
} from "~/components/ui/swift-ui";

interface DropdownMenuItem {
  /**
   * Marks the item as the current choice: the system's checkmark after its
   * label (in place of its `systemImage`), and VoiceOver reads it as
   * selected. Leave it out for an action.
   */
  checked?: boolean;
  destructive?: boolean;
  /** Shown dimmed, and can't be chosen. */
  disabled?: boolean;
  /** Tells items apart when two may share a label; the label without one. */
  id?: string;
  label: string;
  onPress?: () => void;
  /**
   * A second, smaller line under the label, as the system draws one (a
   * disabled item saying why it is).
   */
  subtitle?: string;
  /** Draws a separator above this item. */
  startsSection?: boolean;
  systemImage?: SFSymbol;
}

interface DropdownMenuProps {
  /** What VoiceOver says the menu button does, after its label. */
  accessibilityHint?: string;
  /** VoiceOver label for the menu button; required for an icon-only menu. */
  accessibilityLabel?: string;
  /**
   * React Native content used as the menu button. Takes precedence over
   * `label`/`systemImage`.
   */
  children?: React.ReactNode;
  className?: string;
  /**
   * The icon-only button's color class (`text-primary`); `foreground` without
   * one. Only the button: the items stay the system's.
   */
  iconColorClassName?: string;
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
  accessibilityHint,
  accessibilityLabel,
  iconColorClassName,
  items,
  label,
  systemImage,
  children,
  onPrimaryAction,
  className,
  testID,
}: DropdownMenuProps) => {
  const theme = useSwiftUITheme();
  const iconColor = useClassColor(iconColorClassName);

  // SwiftUI's `Menu` only honours `systemImage` alongside a text label, so an
  // icon-only menu has to supply its button as a label view instead. A text
  // button is a label view too, in `primary`: a `tint` on the Menu would also
  // tint every item's icon (a destructive item's included), which the system
  // draws in the label color.
  const menuLabel = () => {
    if (children) {
      // SAFETY: RNHostView forwards children to React providers without reading element properties.
      return (
        <RNHostView matchContents>{children as React.ReactElement}</RNHostView>
      );
    }

    if (label) {
      return (
        <SwiftUILabel
          modifiers={[menuModifiers.foregroundStyle(theme.primary)]}
          systemImage={systemImage}
          title={label}
        />
      );
    }

    return (
      <SwiftUIImage
        color={iconColor ?? theme.foreground}
        modifiers={[
          menuModifiers.frame({
            height: MIN_HIT_TARGET_SIZE,
            width: MIN_HIT_TARGET_SIZE,
          }),
          menuModifiers.contentShape(menuModifiers.shapes.rectangle()),
        ]}
        systemName={systemImage}
      />
    );
  };

  return (
    <SwiftUIHost className={className} matchContents>
      <Menu
        label={menuLabel()}
        modifiers={[
          ...(accessibilityLabel
            ? [menuModifiers.accessibilityLabel(accessibilityLabel)]
            : []),
          ...(accessibilityHint
            ? [menuModifiers.accessibilityHint(accessibilityHint)]
            : []),
        ]}
        onPrimaryAction={onPrimaryAction}
        testID={testID}
      >
        {items.flatMap((item) => {
          const { onPress: handlePress } = item;

          const itemModifiers = [
            ...(item.checked
              ? [menuModifiers.accessibilityAddTraits(["isSelected"])]
              : []),
            ...(item.disabled ? [menuModifiers.disabled(true)] : []),
          ];

          const icon = item.checked ? "checkmark" : item.systemImage;

          return [
            ...(item.startsSection
              ? [<Divider key={`${item.id ?? item.label}-divider`} />]
              : []),
            item.subtitle ? (
              // A menu reads a button's label views in order: its first text
              // as the title, its second as the line under it, and an image
              // as its icon.
              <SwiftUIButton
                key={item.id ?? item.label}
                modifiers={itemModifiers}
                onPress={handlePress}
                role={item.destructive ? "destructive" : "default"}
              >
                {[
                  <SwiftUIText key="title">{item.label}</SwiftUIText>,
                  <SwiftUIText key="subtitle">{item.subtitle}</SwiftUIText>,
                  ...(icon
                    ? [<SwiftUIImage key="icon" systemName={icon} />]
                    : []),
                ]}
              </SwiftUIButton>
            ) : (
              <SwiftUIButton
                key={item.id ?? item.label}
                label={item.label}
                modifiers={itemModifiers.length > 0 ? itemModifiers : undefined}
                onPress={handlePress}
                role={item.destructive ? "destructive" : "default"}
                systemImage={icon}
              />
            ),
          ];
        })}
      </Menu>
    </SwiftUIHost>
  );
};

DropdownMenu.displayName = "DropdownMenu";

export type { DropdownMenuItem, DropdownMenuProps };

export { DropdownMenu };
