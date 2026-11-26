/**
 * `~/components/ui/swipeable-row` under Jest (`test-utils/setup.ts` mocks it
 * with this module for every test file): the real one is a
 * `ReanimatedSwipeable`, whose pan gesture Jest can't drive.
 *
 * A row that may swipe renders two hidden pressables a test presses in place
 * of the gesture: `<testID>-open` (a short swipe: the row opens and its
 * actions show) and `<testID>-full-swipe` (dragged across and let go). A row
 * that may not swipe renders neither, so `queryByTestId` reads whether it
 * swipes. Its actions show only while it's open, and `close` (through its
 * `ref`) closes it, as the real row does.
 */
import type { ReactNode, Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { Pressable, View } from "react-native";

interface SwipeableRowStubProps {
  children: ReactNode;
  enabled: boolean;
  onClose?: () => void;
  onFullSwipe: () => void;
  onOpen?: () => void;
  ref?: Ref<{ close: () => void }>;
  renderActions: (armed: boolean) => ReactNode;
  testID?: string;
}

const SwipeableRowStub = ({
  children,
  enabled,
  onClose,
  onFullSwipe,
  onOpen,
  ref,
  renderActions,
  testID = "swipeable-row",
}: SwipeableRowStubProps) => {
  const [isOpen, setIsOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    close: () => {
      setIsOpen(false);
      onClose?.();
    },
  }));

  return (
    <View testID={testID}>
      {children}
      {enabled ? (
        <>
          <Pressable
            accessible={false}
            onPress={() => {
              setIsOpen(true);
              onOpen?.();
            }}
            testID={`${testID}-open`}
          />
          <Pressable
            accessible={false}
            onPress={onFullSwipe}
            testID={`${testID}-full-swipe`}
          />
        </>
      ) : null}
      {enabled && isOpen ? renderActions(false) : null}
    </View>
  );
};

export default SwipeableRowStub;
