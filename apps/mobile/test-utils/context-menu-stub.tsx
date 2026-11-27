/**
 * Stand-in for `~/components/ui/context-menu`, whose SwiftUI `ContextMenu`
 * can't mount under Jest: a long press on its trigger (the children, wrapped
 * in a pressable carrying the menu's `testID`) opens the menu, which shows
 * each item as a `menuitem` named by its label; pressing one runs it and
 * closes the menu. A disabled item is marked disabled and can't be pressed,
 * and a destructive one carries the `destructive` hint. Use it with
 * `jest.mock("~/components/ui/context-menu", () => jest.requireActual("~/test-utils/context-menu-stub"))`.
 */
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import type {
  ContextMenuItem,
  ContextMenuProps,
} from "~/components/ui/context-menu";

/** The `accessibilityHint` a destructive item carries in the stand-in. */
export const DESTRUCTIVE_HINT = "destructive";

const MenuItem = ({
  item,
  onClose,
}: {
  item: ContextMenuItem;
  onClose: () => void;
}) => {
  const press = useCallback(() => {
    onClose();
    item.onPress?.();
  }, [item, onClose]);

  return (
    <Pressable
      accessibilityHint={item.destructive ? DESTRUCTIVE_HINT : undefined}
      accessibilityLabel={item.label}
      accessibilityRole="menuitem"
      accessibilityState={{ disabled: item.disabled === true }}
      disabled={item.disabled}
      onPress={press}
    />
  );
};

export const ContextMenu = ({ children, items, testID }: ContextMenuProps) => {
  const [open, setOpen] = useState(false);
  const openMenu = useCallback(() => setOpen(true), []);
  const closeMenu = useCallback(() => setOpen(false), []);

  return (
    <View>
      <Pressable onLongPress={openMenu} testID={testID}>
        {children}
      </Pressable>
      {open
        ? items.map((item) => (
            <MenuItem item={item} key={item.label} onClose={closeMenu} />
          ))
        : null}
    </View>
  );
};
