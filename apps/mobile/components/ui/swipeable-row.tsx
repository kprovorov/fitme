import type { ReactNode, Ref } from "react";
import { useImperativeHandle, useRef, useState } from "react";
import { View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

/**
 * How far a row is dragged, as a share of its width, for releasing it to run
 * the action instead of leaving it open on its button.
 */
const FULL_SWIPE_SHARE = 0.6;

/** What a row's owner can do to it: close it, as when another one opens. */
export interface SwipeableRowHandle {
  close: () => void;
}

interface SwipeableRowProps {
  /** The width the actions open to; a longer drag stretches them. */
  actionWidth: number;
  children: ReactNode;
  enabled: boolean;
  /** Dragged past the full swipe and released. */
  onFullSwipe: () => void;
  /** Closed again, by a drag back or by `close`. */
  onClose?: () => void;
  /** Starting to open: a drag began, or it's about to settle open. */
  onOpen?: () => void;
  ref?: Ref<SwipeableRowHandle>;
  /**
   * The actions a swipe left uncovers. `armed` is whether letting go now
   * would run the full swipe, so the action can show it.
   */
  renderActions: (armed: boolean) => ReactNode;
  testID?: string;
}

/**
 * The uncovered actions: as wide as the drag, never narrower than
 * `minWidth`, so no gap opens between them and the row. It tells the row when
 * the drag passes the full swipe.
 */
const Actions = ({
  children,
  distance,
  minWidth,
  onArmedChange,
  translation,
}: {
  children: ReactNode;
  distance: number;
  minWidth: number;
  onArmedChange: (armed: boolean) => void;
  translation: SharedValue<number>;
}) => {
  const style = useAnimatedStyle(() => ({
    width: Math.max(minWidth, -translation.value),
  }));

  useAnimatedReaction(
    () => distance > 0 && translation.value < -distance,
    (armed, previous) => {
      if (armed !== previous) {
        scheduleOnRN(onArmedChange, armed);
      }
    },
    [distance]
  );

  return <Animated.View style={style}>{children}</Animated.View>;
};

/**
 * A row that swipes left to uncover `renderActions`, and runs `onFullSwipe`
 * when dragged most of the way across and let go. The only importer of
 * `ReanimatedSwipeable`, so a test swaps this one module for
 * `test-utils/swipeable-row-stub.tsx`: Jest can't drive the gesture.
 */
const SwipeableRow = ({
  actionWidth,
  children,
  enabled,
  onClose,
  onFullSwipe,
  onOpen,
  ref,
  renderActions,
  testID,
}: SwipeableRowProps) => {
  const swipeable = useRef<SwipeableMethods | null>(null);
  const [width, setWidth] = useState(0);
  const [armed, setArmed] = useState(false);
  // Read on release, which the drag's last report always comes before.
  const armedNow = useRef(false);

  useImperativeHandle(ref, () => ({
    close: () => swipeable.current?.close(),
  }));

  const handleArmedChange = (next: boolean) => {
    armedNow.current = next;
    setArmed(next);
  };

  const handleWillOpen = () => {
    if (armedNow.current) {
      onFullSwipe();

      return;
    }

    onOpen?.();
  };

  const handleClose = () => {
    handleArmedChange(false);
    onClose?.();
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View onLayout={handleLayout}>
      <ReanimatedSwipeable
        enabled={enabled}
        friction={1}
        onSwipeableClose={handleClose}
        onSwipeableOpenStartDrag={onOpen}
        onSwipeableWillOpen={handleWillOpen}
        ref={swipeable}
        testID={testID}
        renderRightActions={(_progress, translation) => (
          <Actions
            distance={Math.max(actionWidth, width * FULL_SWIPE_SHARE)}
            minWidth={actionWidth}
            onArmedChange={handleArmedChange}
            translation={translation}
          >
            {renderActions(armed)}
          </Actions>
        )}
      >
        {children}
      </ReanimatedSwipeable>
    </View>
  );
};

export default SwipeableRow;
