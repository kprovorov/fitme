import { BottomSheet, Group, RNHostView } from "@expo/ui/swift-ui";
import { interactiveDismissDisabled, tint } from "@expo/ui/swift-ui/modifiers";
import type * as React from "react";
import { useWindowDimensions, View } from "react-native";
import { SwiftUIHost, useSwiftUITheme } from "~/components/ui/swift-ui";
import { cn } from "~/lib/utils";

interface DialogProps {
  /** React Native content shown inside the sheet. */
  children?: React.ReactNode;
  contentClassName?: string;
  /** Stops the sheet from being swiped down or dismissed by tapping outside. */
  dismissDisabled?: boolean;
  /** Sizes the sheet to its content instead of a half-height detent. */
  fitToContents?: boolean;
  isPresented: boolean;
  onIsPresentedChange: (isPresented: boolean) => void;
}

/**
 * A native sheet presented from the bottom of the screen. The trigger lives
 * with the caller — flip `isPresented` to present it.
 */
const Dialog = ({
  isPresented,
  onIsPresentedChange,
  fitToContents = true,
  dismissDisabled = false,
  children,
  contentClassName,
}: DialogProps) => {
  const theme = useSwiftUITheme();
  // Sized to its contents, the sheet would grow as wide as its longest line
  // instead of wrapping it: the content takes the window's width, which is
  // the sheet's on an iPhone (the app doesn't run on iPad).
  const { width } = useWindowDimensions();

  return (
    <SwiftUIHost className="h-0 w-0">
      <BottomSheet
        fitToContents={fitToContents}
        isPresented={isPresented}
        onIsPresentedChange={onIsPresentedChange}
      >
        {/* Presentation modifiers only apply from inside the sheet's content. */}
        <Group
          modifiers={[
            interactiveDismissDisabled(dismissDisabled),
            tint(theme.primary),
          ]}
        >
          <RNHostView matchContents={fitToContents}>
            <View
              className={cn("gap-4 p-6", contentClassName)}
              style={{ width }}
            >
              {children}
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </SwiftUIHost>
  );
};

Dialog.displayName = "Dialog";

export type { DialogProps };
export { Dialog };
