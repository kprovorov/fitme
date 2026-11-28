/**
 * Stand-in for `~/components/ui/dropdown-menu`, whose SwiftUI `Menu` can't
 * mount under Jest: its button (named by its spoken label, or its text
 * label) opens the menu, which shows each item as a `menuitem` named by its
 * label (a `checked` one with `accessibilityState.checked`); pressing one
 * runs it and closes the menu. The button carries the menu's spoken hint and
 * renders its `children`, as the real button shows them. Use it with
 * `jest.mock("~/components/ui/dropdown-menu", () => jest.requireActual("~/test-utils/dropdown-menu-stub"))`.
 */
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import type {
  DropdownMenuItem,
  DropdownMenuProps,
} from "~/components/ui/dropdown-menu";

const MenuItem = ({
  item,
  onClose,
}: {
  item: DropdownMenuItem;
  onClose: () => void;
}) => {
  const press = useCallback(() => {
    onClose();
    item.onPress?.();
  }, [item, onClose]);

  return (
    <Pressable
      accessibilityLabel={item.label}
      accessibilityRole="menuitem"
      accessibilityState={
        item.checked === undefined ? undefined : { checked: item.checked }
      }
      onPress={press}
    />
  );
};

export const DropdownMenu = ({
  accessibilityHint,
  accessibilityLabel,
  children,
  items,
  label,
  systemImage,
  testID,
}: DropdownMenuProps) => {
  const [open, setOpen] = useState(false);
  const openMenu = useCallback(() => setOpen(true), []);
  const closeMenu = useCallback(() => setOpen(false), []);

  return (
    <View>
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityRole="button"
        onPress={openMenu}
        testID={testID ?? `menu-${systemImage}`}
      >
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
