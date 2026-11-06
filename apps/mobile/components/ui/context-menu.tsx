import {
  RNHostView,
  Button as SwiftUIButton,
  ContextMenu as SwiftUIContextMenu,
} from "@expo/ui/swift-ui";
import type * as React from "react";
import type { SFSymbol } from "sf-symbols-typescript";

import { SwiftUIHost } from "~/components/ui/swift-ui";

interface ContextMenuItem {
  destructive?: boolean;
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

/**
 * A native context menu on long press. It takes no `tint`: the system draws
 * the items in the label color and a destructive one in red, and a tint would
 * repaint every item's icon (the destructive one's included) in `primary`.
 */
const ContextMenu = ({
  items,
  children,
  className,
  testID,
}: ContextMenuProps) => (
  <SwiftUIHost className={className} matchContents>
    <SwiftUIContextMenu testID={testID}>
      <SwiftUIContextMenu.Items>
        {items.map(
          ({ destructive, label, onPress: handlePress, systemImage }) => (
            <SwiftUIButton
              key={label}
              label={label}
              onPress={handlePress}
              role={destructive ? "destructive" : "default"}
              systemImage={systemImage}
            />
          )
        )}
      </SwiftUIContextMenu.Items>
      <SwiftUIContextMenu.Trigger>
        <RNHostView matchContents>{children}</RNHostView>
      </SwiftUIContextMenu.Trigger>
    </SwiftUIContextMenu>
  </SwiftUIHost>
);

ContextMenu.displayName = "ContextMenu";

export type { ContextMenuItem, ContextMenuProps };

export { ContextMenu };
