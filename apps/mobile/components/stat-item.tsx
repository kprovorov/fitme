import { View } from "react-native";

import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";

/** How far a side-by-side value may shrink: title 2's 22 pt down to 13 pt. */
const MIN_VALUE_FONT_SCALE = 0.6;

interface StatItemProps {
  /** Tints the value lime, as the first figure of a row is. */
  accent?: boolean;
  /** What VoiceOver reads for the whole figure: `Workouts: 3 workouts`. */
  accessibilityLabel: string;
  /** One under another (large text) rather than side by side. */
  stacked: boolean;
  title: string;
  value: string;
}

/**
 * One summary figure: a large value over its caption (Figma's StatItem), read
 * by VoiceOver as one element. History's month overview and Profile's
 * Lifetime totals show it.
 */
export const StatItem = ({
  accent = false,
  accessibilityLabel,
  stacked,
  title,
  value,
}: StatItemProps) => (
  <View
    accessibilityLabel={accessibilityLabel}
    accessible
    className={stacked ? "gap-0.5" : "flex-1 gap-0.5"}
  >
    {/* Side by side a column is a third of the row, which a long compact
        value (`3,6 тис. фунт`) overruns: it shrinks to one line there.
        Stacked, at an accessibility text size, it has the row to itself and
        keeps its size, wrapping if it must. */}
    <Text
      adjustsFontSizeToFit={!stacked}
      minimumFontScale={stacked ? undefined : MIN_VALUE_FONT_SCALE}
      numberOfLines={stacked ? undefined : 1}
      className={cn(
        "text-title-2-emphasized",
        accent ? "text-primary" : "text-foreground"
      )}
    >
      {value}
    </Text>
    <Text className="text-footnote text-muted-foreground">{title}</Text>
  </View>
);
