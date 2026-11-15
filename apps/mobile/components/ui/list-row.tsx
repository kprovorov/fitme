import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { AccessibilityRole } from "react-native";

import { SymbolImage } from "~/components/symbol-image";
import { MenuList } from "~/components/ui/menu-list";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";

/**
 * A group of `ListRow`s (Figma's `Group` in Profile and its pushed screens):
 * an optional section header in `footnote-emphasized`, then the rows on a
 * bordered `MenuList`.
 */
export const ListSection = ({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) => (
  <View className="gap-xs">
    {title ? (
      <Text
        accessibilityRole="header"
        className="pl-sm text-footnote-emphasized text-muted-foreground"
      >
        {title}
      </Text>
    ) : null}
    <MenuList bordered>{children}</MenuList>
  </View>
);

interface ListRowProps {
  accessibilityRole?: AccessibilityRole;
  /** A second line under the label, in `footnote` (Support's address). */
  detail?: string;
  label: string;
  onPress: () => void;
  /** The `Separator` above the row: off on a group's first row. */
  separator?: boolean;
}

/**
 * Figma's `ListRow` (1472:3401), `navigation` type: the label (and its
 * detail), then a disclosure chevron, at least 44 pt tall. Its top
 * `Separator` starts at the label, as a grouped list's does, and the pressed
 * highlight fills the row.
 */
export const ListRow = ({
  accessibilityRole = "button",
  detail,
  label,
  onPress,
  separator = true,
}: ListRowProps) => (
  <Pressable
    accessibilityRole={accessibilityRole}
    className="active:bg-accent pl-sm"
    onPress={onPress}
  >
    {separator ? <Separator /> : null}
    <View className="gap-xs pr-sm min-h-11 flex-row items-center py-3">
      <View className="flex-1 gap-0.5">
        <Text className="text-body">{label}</Text>
        {detail ? (
          <Text className="text-footnote text-muted-foreground">{detail}</Text>
        ) : null}
      </View>
      <SymbolImage
        className="text-body text-muted-foreground shrink-0"
        name="chevron.right"
      />
    </View>
  </Pressable>
);
