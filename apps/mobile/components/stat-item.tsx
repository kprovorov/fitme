import { View } from "react-native";

import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";

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
    <Text
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
