/**
 * `sonner-native` under Jest (`test-utils/setup.ts` mocks it with this
 * module): the real one animates through Reanimated and lays toasts out in a
 * native overlay, which Jest never draws, so a test couldn't read a toast.
 *
 * `toast.custom` keeps each toast's content (and its options, read with
 * `shownToastOptions`), in the order shown, and
 * `Toaster` renders all of them, so a screen test that renders the app's
 * `Toaster` (`~/components/ui/toast`) next to its Screen finds the message
 * with `getByText`. Nothing hides itself: a toast stays until `resetToasts`
 * (run by `after-each.ts`). Only the members the app uses are here, so a new
 * call site fails its test rather than silently doing nothing.
 */
import type { ReactElement } from "react";
import { Fragment, useSyncExternalStore } from "react";

let toasts: readonly ReactElement[] = [];
let options: readonly ToastOptions[] = [];

interface ToastOptions {
  duration?: number;
}

const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const notify = () => {
  for (const listener of listeners) {
    listener();
  }
};

/** The options each toast was shown with, in order (its `duration`). */
export const shownToastOptions = () => options;

/** Forgets every toast shown, as if each had hidden itself. */
export const resetToasts = () => {
  toasts = [];
  options = [];
  notify();
};

export const sonnerModule = {
  Toaster: () => {
    const shown = useSyncExternalStore(subscribe, () => toasts);

    return (
      <>
        {shown.map((content, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- Toasts are only ever appended, so a toast keeps its index.
          <Fragment key={index}>{content}</Fragment>
        ))}
      </>
    );
  },
  toast: {
    custom: (content: ReactElement, given: ToastOptions = {}) => {
      toasts = [...toasts, content];
      options = [...options, given];
      notify();

      return toasts.length;
    },
  },
};
