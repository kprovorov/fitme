import { View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

import { SymbolImage } from "~/components/symbol-image";
import { Button } from "~/components/ui/button";
import { Large, Muted } from "~/components/ui/typography";

/** An empty state's symbol, standing alone over its title. */
const SYMBOL_SIZE = 48;

interface ExerciseUnavailableProps {
  /** Its one action (Try Again, Back to Library); none for a state with nowhere to go. */
  action?: { label: string; onPress: () => void };
  message: string;
  symbol: SFSymbol;
  title: string;
}

/**
 * What the Exercise detail screen or its guide shows with no Exercise to
 * show (not found, failed to load, no steps): a muted SF Symbol, a title and
 * a muted line, centred, with its one action under them (Figma's
 * `ContentUnavailableView`, FIT-737).
 */
export const ExerciseUnavailable = ({
  action,
  message,
  symbol,
  title,
}: ExerciseUnavailableProps) => {
  const handleAction = action?.onPress;

  return (
    <View
      className="gap-md px-sm flex-1 items-center justify-center"
      testID="exercise-unavailable"
    >
      <View className="gap-sm items-center">
        <SymbolImage
          className="text-muted-foreground"
          name={symbol}
          size={SYMBOL_SIZE}
        />
        <View className="gap-xs items-center">
          <Large className="text-center">{title}</Large>
          <Muted className="text-center">{message}</Muted>
        </View>
      </View>
      {action ? (
        <Button
          fill={false}
          label={action.label}
          onPress={handleAction}
          size="lg"
        />
      ) : null}
    </View>
  );
};
