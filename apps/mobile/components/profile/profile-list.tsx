import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { SymbolImage } from "~/components/symbol-image";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";

/**
 * A titled group of rows on Profile (Figma's `Group · …`): its header in
 * Footnote Emphasized, then the rows on a bordered `card` surface.
 */
export const ProfileListSection = ({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) => (
  <View className="gap-xs w-full">
    <Text
      accessibilityRole="header"
      className="ml-sm text-footnote-emphasized text-muted-foreground"
    >
      {title}
    </Text>
    <View className="rounded-card border-border bg-card w-full overflow-hidden border">
      {children}
    </View>
  </View>
);

/**
 * A navigation row (Figma's `ListRow`, type navigation): the label, an
 * optional value and a chevron, at least 44 pt tall. Every row but a group's
 * first draws the separator above it, inset by the row's leading padding.
 * Without `onPress` it does nothing yet (a screen still to come).
 */
export const ProfileListRow = ({
  first = false,
  label,
  onPress,
  testID,
  value,
}: {
  first?: boolean;
  label: string;
  onPress?: () => void;
  testID?: string;
  value?: string;
}) => (
  <Pressable
    accessibilityHint={value}
    accessibilityLabel={label}
    accessibilityRole="button"
    className="pl-sm active:bg-accent"
    onPress={onPress}
    testID={testID}
  >
    {first ? null : <Separator />}
    <View className="gap-xs pr-sm min-h-11 flex-row items-center py-3">
      <Text className="text-body text-foreground flex-1">{label}</Text>
      {value ? (
        <Text className="text-body text-muted-foreground shrink-0">
          {value}
        </Text>
      ) : null}
      <SymbolImage
        className="text-body text-muted-foreground shrink-0"
        name="chevron.right"
      />
    </View>
  </Pressable>
);
