import { View } from "react-native";
import { Toaster as SonnerToaster } from "sonner-native";

import { Text } from "~/components/ui/text";

/**
 * A toast's pill (Figma's `Toast`, as in the Log out failed frame,
 * 1476:3889): one message, centered, in `text-body` on `secondary`, the `sm`
 * gutter either side. Shown through `showToast` (`lib/toast.tsx`), never on
 * its own.
 *
 * sonner-native puts the bottom toast 8 pt above the home indicator; its
 * `mb-xs` makes that Figma's `sm` (16). It's done here rather than with the
 * Toaster's `offset`, which would have the Toaster read the safe area itself,
 * and so need a `SafeAreaProvider` in every screen test that renders it.
 */
export const ToastPill = ({ message }: { message: string }) => (
  <View className="mx-sm mb-xs border-continuous bg-secondary px-sm rounded-full py-3">
    <Text className="text-center">{message}</Text>
  </View>
);

/**
 * The app's one Toaster, in the root layout, at the bottom of the screen. A
 * toast is swiped away to the left, since `up` (sonner-native's only other
 * direction) drags it into the screen.
 */
export const Toaster = () => (
  <SonnerToaster position="bottom-center" swipeToDismissDirection="left" />
);
