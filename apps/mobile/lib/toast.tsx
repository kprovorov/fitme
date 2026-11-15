import { AccessibilityInfo, Platform } from "react-native";
import { toast } from "sonner-native";

import { ToastPill } from "~/components/ui/toast";

/** sonner-native's own default, enough for a few words. */
const MIN_TOAST_MS = 4000;

/** About a reading speed of 15 characters a second, on top of the minimum. */
const TOAST_MS_PER_CHARACTER = 60;

/** Long enough for any toast's text without leaving it up for good. */
const MAX_TOAST_MS = 10_000;

/**
 * How long a toast stays: longer for a longer message, which takes longer
 * to read (and wraps onto more lines at a large text size).
 */
export const toastDuration = (message: string) =>
  Math.min(
    MAX_TOAST_MS,
    MIN_TOAST_MS + message.length * TOAST_MS_PER_CHARACTER
  );

/**
 * The one way to show a toast: a short message in a pill at the bottom of the
 * screen that hides itself, drawn by the root layout's `Toaster`. Pass
 * catalog text (`showToast(t("…"))`), never a literal.
 *
 * sonner-native marks a toast `aria-live`, which only Android announces, so
 * VoiceOver gets the message here, queued behind whatever it is saying (the
 * button just pressed), so it isn't cut off.
 */
export const showToast = (message: string) => {
  toast.custom(<ToastPill message={message} />, {
    duration: toastDuration(message),
  });

  if (Platform.OS === "ios") {
    AccessibilityInfo.announceForAccessibilityWithOptions(message, {
      queue: true,
    });
  }
};
