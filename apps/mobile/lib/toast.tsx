import { AccessibilityInfo, Platform } from "react-native";
import { toast } from "sonner-native";

import { ToastPill } from "~/components/ui/toast";

/**
 * The one way to show a toast: a short message in a pill at the bottom of the
 * screen that hides itself, drawn by the root layout's `Toaster`. Pass
 * catalog text (`showToast(t("…"))`), never a literal.
 *
 * sonner-native marks a toast `aria-live`, which only Android announces, so
 * VoiceOver gets the message through `announceForAccessibility` here.
 */
export const showToast = (message: string) => {
  toast.custom(<ToastPill message={message} />);

  if (Platform.OS === "ios") {
    AccessibilityInfo.announceForAccessibility(message);
  }
};
