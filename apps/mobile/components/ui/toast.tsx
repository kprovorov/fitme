import type { ReactNode } from "react";
import { Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { initialWindowMetrics } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import { Toaster as SonnerToaster } from "sonner-native";
import { useResolveClassNames } from "uniwind";

import { Text } from "~/components/ui/text";

/**
 * A toast's pill (Figma's `Toast`, as in the Log out failed frame,
 * 1476:3889): one message, centered, in `text-body` on `secondary`, the `sm`
 * gutter either side. Shown through `showToast` (`lib/toast.tsx`), never on
 * its own.
 *
 * Figma draws it `rounded-full`; `rounded-4xl` (32) is the same pill for one
 * line and within 2 pt for two, and stays a rounded rectangle when Dynamic
 * Type wraps it onto more, where a full radius would make an ellipse that
 * clips the text.
 */
export const ToastPill = ({ message }: { message: string }) => (
  <View className="mx-sm border-continuous bg-secondary px-sm rounded-4xl py-3">
    <Text className="text-center">{message}</Text>
  </View>
);

/**
 * On iOS sonner-native draws its toasts in a `FullWindowOverlay`, a window of
 * its own outside the app's `GestureHandlerRootView`, where a toast's swipe
 * would find no gesture root. This one is the same overlay with a root in it,
 * letting every touch that misses a toast through to the app (`box-none`).
 */
const ToasterOverlay = ({ children }: { children: ReactNode }) => (
  <FullWindowOverlay>
    <GestureHandlerRootView className="flex-1" pointerEvents="box-none">
      {children}
    </GestureHandlerRootView>
  </FullWindowOverlay>
);

/**
 * The bottom safe area, read once: the app is portrait only, so it never
 * changes. Read from the window rather than `useSafeAreaInsets`, which would
 * need a `SafeAreaProvider` around every screen test that renders the
 * Toaster.
 */
const bottomInset = initialWindowMetrics?.insets.bottom ?? 0;

/**
 * The app's one Toaster, in the root layout: at the bottom of the screen, the
 * `sm` gap above the home indicator. A toast is swiped away to the left,
 * since `up` (sonner-native's only other direction) drags it into the screen.
 */
export const Toaster = () => {
  // SAFETY: uniwind resolves a spacing token (`sm`) to its numeric points.
  const gap = useResolveClassNames("pb-sm").paddingBottom as number;

  return (
    <SonnerToaster
      offset={bottomInset + gap}
      position="bottom-center"
      swipeToDismissDirection="left"
      ToasterOverlayWrapper={Platform.OS === "ios" ? ToasterOverlay : undefined}
    />
  );
};
