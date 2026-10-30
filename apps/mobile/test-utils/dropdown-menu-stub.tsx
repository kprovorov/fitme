/**
 * Stand-in for `~/components/ui/dropdown-menu`, whose SwiftUI `Menu` can't
 * mount under Jest: its button (named by its spoken label, or its text
 * label) opens the menu, which shows each item as a `menuitem` named by its
 * label; pressing one runs it and closes the menu. Use it with
 * `jest.mock("~/components/ui/dropdown-menu", () => jest.requireActual("~/test-utils/dropdown-menu-stub"))`.
 */
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

interface DropdownMenuItem {
  label: string;
  onPress?: () => void;
  systemImage?: string;
}

interface DropdownMenuProps {
  accessibilityLabel?: string;
  items: DropdownMenuItem[];
  label?: string;
  systemImage?: string;
  testID?: string;
}

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
      onPress={press}
    />
  );
};

export const DropdownMenu = ({
  accessibilityLabel,
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
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityRole="button"
        onPress={openMenu}
        testID={testID ?? `menu-${systemImage}`}
      />
      {open
        ? items.map((item) => (
            <MenuItem item={item} key={item.label} onClose={closeMenu} />
          ))
        : null}
    </View>
  );
};
