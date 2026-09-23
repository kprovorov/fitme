import { BottomSheet, RNHostView } from "@expo/ui/swift-ui";
import type * as React from "react";
import { View } from "react-native";
import { SwiftUIHost } from "~/components/ui/swift-ui";
import { cn } from "~/lib/utils";

interface DialogProps {
  /** React Native content shown inside the sheet. */
  children?: React.ReactNode;
  contentClassName?: string;
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
  children,
  contentClassName,
}: DialogProps) => (
  <SwiftUIHost className="h-0 w-0">
    <BottomSheet
      fitToContents={fitToContents}
      isPresented={isPresented}
      onIsPresentedChange={onIsPresentedChange}
    >
      <RNHostView matchContents={fitToContents}>
        <View className={cn("gap-4 p-6", contentClassName)}>{children}</View>
      </RNHostView>
    </BottomSheet>
  </SwiftUIHost>
);

Dialog.displayName = "Dialog";

export type { DialogProps };
export { Dialog };
