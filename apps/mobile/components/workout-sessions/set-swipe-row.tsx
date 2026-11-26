import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { SET_TABLE_MAX_FONT_SCALE } from "~/components/forms/workout-exercise-set-form";
import SwipeableRow from "~/components/ui/swipeable-row";
import type { SwipeableRowHandle } from "~/components/ui/swipeable-row";
import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";

/** How wide a short swipe opens the Remove button. */
const REMOVE_ACTION_WIDTH = 88;

// The one set row open on its Remove button, on whichever screen or card:
// opening another closes it.
let openRow: SwipeableRowHandle | null = null;

interface SetSwipeRowProps {
  children: ReactNode;
  /** Whether the row swipes: not while its own save runs, for one. */
  enabled: boolean;
  /** The row's shown number, for its test id. */
  number: number;
  /** `close` closes the row again, should the User keep the set. */
  onRemove: (close: () => void) => void;
}

/**
 * A Workout Session set's row that swipes left: a short swipe uncovers a red
 * Remove button, a full one removes. VoiceOver and TalkBack reach the
 * removal through the accessibility action on the set's `#n` cell instead
 * (`workout-session-exercise-set-row-view.tsx`), so the button is hidden from
 * them.
 */
const SetSwipeRow = ({
  children,
  enabled,
  number,
  onRemove,
}: SetSwipeRowProps) => {
  const { t } = useTranslation();
  const row = useRef<SwipeableRowHandle | null>(null);

  // This row, as the one open: closing it closes the gesture's row.
  const self = useRef<SwipeableRowHandle>({
    close: () => row.current?.close(),
  });

  useEffect(
    () => () => {
      if (openRow === self.current) {
        openRow = null;
      }
    },
    []
  );

  const handleOpen = () => {
    if (openRow && openRow !== self.current) {
      openRow.close();
    }

    openRow = self.current;
  };

  const handleRemove = () => onRemove(() => row.current?.close());

  const handleClose = () => {
    if (openRow === self.current) {
      openRow = null;
    }
  };

  return (
    <SwipeableRow
      actionWidth={REMOVE_ACTION_WIDTH}
      enabled={enabled}
      onClose={handleClose}
      onFullSwipe={handleRemove}
      onOpen={handleOpen}
      ref={row}
      renderActions={(armed) => (
        <Pressable
          accessibilityElementsHidden
          className={cn(
            "bg-destructive ml-xs flex-1 justify-center rounded-lg",
            armed ? "px-sm items-start" : "px-xs items-center"
          )}
          importantForAccessibility="no-hide-descendants"
          onPress={handleRemove}
          testID={`remove-set-button-${number}`}
        >
          <Text
            adjustsFontSizeToFit
            className="text-body-emphasized text-destructive-foreground"
            // As the table's numbers: past this the word won't fit the row.
            maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
            numberOfLines={1}
          >
            {t("sets.remove.button")}
          </Text>
        </Pressable>
      )}
      testID={`set-row-${number}`}
    >
      {/* The card's color, so the Remove button stays behind the row. */}
      <View className="bg-card">{children}</View>
    </SwipeableRow>
  );
};

export default SetSwipeRow;
