import {
  RNHostView,
  Button as SwiftUIButton,
  ContextMenu as SwiftUIContextMenu,
} from "@expo/ui/swift-ui";
import { disabled as disabledModifier } from "@expo/ui/swift-ui/modifiers";
import type * as React from "react";
import type { SFSymbol } from "sf-symbols-typescript";

import { isStretchClassName, SwiftUIHost } from "~/components/ui/swift-ui";

interface ContextMenuItem {
  destructive?: boolean;
  /** Shown dimmed, and can't be chosen. */
  disabled?: boolean;
  label: string;
  onPress?: () => void;
  systemImage?: SFSymbol;
}

interface ContextMenuProps {
  /** React Native content that opens the menu on long press. */
  children: React.ReactElement;
  className?: string;
  items: ContextMenuItem[];
  testID?: string;
}

/** Width from the parent, height from the content: a full-width trigger. */
const STRETCH_MATCH = { vertical: true } as const;

/**
 * A native context menu on long press. It takes no `tint`: the system draws
 * the items in the label color and a destructive one in red, and a tint would
 * repaint every item's icon (the destructive one's included) in `primary`.
 * By default it's as big as its trigger; a stretch class (`self-stretch`,
 * `w-full`, …) makes it as wide as its parent instead, the trigger laid out
 * at that width, so a full-width row or card keeps its width.
 */
const ContextMenu = ({
  items,
  children,
  className,
  testID,
}: ContextMenuProps) => {
  const match = isStretchClassName(className) ? STRETCH_MATCH : true;

  return (
    <SwiftUIHost className={className} matchContents={match}>
      <SwiftUIContextMenu testID={testID}>
        <SwiftUIContextMenu.Items>
          {items.map(
            ({
              destructive,
              disabled,
              label,
              onPress: handlePress,
              systemImage,
            }) => (
              <SwiftUIButton
                key={label}
                label={label}
                modifiers={disabled ? [disabledModifier(true)] : undefined}
                onPress={handlePress}
                role={destructive ? "destructive" : "default"}
                systemImage={systemImage}
              />
            )
          )}
        </SwiftUIContextMenu.Items>
        <SwiftUIContextMenu.Trigger>
          <RNHostView matchContents={match}>{children}</RNHostView>
        </SwiftUIContextMenu.Trigger>
      </SwiftUIContextMenu>
    </SwiftUIHost>
  );
};

ContextMenu.displayName = "ContextMenu";

export type { ContextMenuItem, ContextMenuProps };

export { ContextMenu };
