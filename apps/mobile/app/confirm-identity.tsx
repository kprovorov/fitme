import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { ConfirmIdentityView } from "~/components/views/confirm-identity-view";
import {
  markConfirmSheetClosed,
  settleReverification,
  usePendingReverification,
} from "~/hooks/reverification";

/**
 * "Confirm it's you": the form sheet `useReverifiedCall` opens when Clerk
 * asks for reverification, showing the newest ask. Closing it any way but a confirmed Continue
 * (Cancel, a swipe, VoiceOver's escape) cancels the call that asked, so it
 * never runs and its promise never hangs.
 */
const ConfirmIdentityScreen = () => {
  const router = useRouter();
  const pending = usePendingReverification();
  // The ask on screen: a newer one takes over this sheet (its own is
  // cancelled), and the last one stays while the sheet slides away.
  const [shown, setShown] = useState(pending);

  if (pending && pending !== shown) {
    setShown(pending);
  }

  const reverification = pending ?? shown;

  const handleDone = useCallback(
    (answer: "cancel" | "complete") => {
      markConfirmSheetClosed();
      router.back();

      if (reverification) {
        settleReverification(reverification.id, answer);
      }
    },
    [reverification, router]
  );

  useEffect(() => {
    if (!reverification) {
      // Nothing is asking (a stale deep link): there's nothing to confirm.
      router.back();
    }
  }, [reverification, router]);

  // Closing the sheet, however it closes, lets the next ask open one.
  useEffect(() => markConfirmSheetClosed, []);

  const id = reverification?.id;

  useEffect(() => {
    if (id === undefined) {
      return;
    }

    // Swiped away without an answer: cancel. Settling twice is a no-op.
    return () => settleReverification(id, "cancel");
  }, [id]);

  if (!reverification) {
    return null;
  }

  return (
    <ConfirmIdentityView
      key={reverification.id}
      onDone={handleDone}
      reverification={reverification}
    />
  );
};

export default ConfirmIdentityScreen;
