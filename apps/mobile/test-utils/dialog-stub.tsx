/**
 * Stand-in for `~/components/ui/dialog`, whose SwiftUI sheet can't mount
 * under Jest: a View carrying the sheet's props (`isPresented`,
 * `dismissDisabled`, `onIsPresentedChange`) that renders its children only
 * while presented. Fire `isPresentedChange` on it (testID `native-sheet`) the
 * way the native sheet does when swiped down. Use it with
 * `jest.mock("~/components/ui/dialog", () => jest.requireActual("~/test-utils/dialog-stub"))`.
 */
import type * as React from "react";
import { View } from "react-native";

interface DialogProps {
  children?: React.ReactNode;
  dismissDisabled?: boolean;
  isPresented: boolean;
  onIsPresentedChange: (isPresented: boolean) => void;
}

export const Dialog = ({
  children,
  dismissDisabled,
  isPresented,
  onIsPresentedChange,
}: DialogProps) => (
  <View
    {...{ dismissDisabled, isPresented, onIsPresentedChange }}
    testID="native-sheet"
  >
    {isPresented ? children : null}
  </View>
);
