import {
  RNHostView,
  Button as SwiftUIButton,
  ContextMenu as SwiftUIContextMenu,
} from "@expo/ui/swift-ui";
import { tint } from "@expo/ui/swift-ui/modifiers";
import type * as React from "react";
import type { SFSymbol } from "sf-symbols-typescript";
import { SwiftUIHost, useSwiftUITheme } from "~/components/ui/swift-ui";

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

const ContextMenu = ({
  items,
  children,
  className,
  testID,
}: ContextMenuProps) => {
  const theme = useSwiftUITheme();

  return (
    <SwiftUIHost className={className} matchContents>
      <SwiftUIContextMenu modifiers={[tint(theme.primary)]} testID={testID}>
        <SwiftUIContextMenu.Items>
          {items.map((item) => (
            <SwiftUIButton
              key={item.label}
              label={item.label}
              onPress={item.onPress}
              role={item.destructive ? "destructive" : "default"}
              systemImage={item.systemImage}
            />
          ))}
        </SwiftUIContextMenu.Items>
        <SwiftUIContextMenu.Trigger>
          <RNHostView matchContents>{children}</RNHostView>
        </SwiftUIContextMenu.Trigger>
      </SwiftUIContextMenu>
    </SwiftUIHost>
  );
};

ContextMenu.displayName = "ContextMenu";

export type { ContextMenuItem, ContextMenuProps };
export { ContextMenu };
