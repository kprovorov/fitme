import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { ConfirmIdentityView } from "~/components/views/confirm-identity-view";
import {
  settleReverification,
  usePendingReverification,
} from "~/hooks/reverification";

/**
 * "Confirm it's you": the form sheet `useReverifiedCall` opens when Clerk
 * asks for reverification. Closing it any way but a confirmed Continue
 * (Cancel, a swipe, VoiceOver's escape) cancels the call that asked, so it
 * never runs and its promise never hangs.
 */
const ConfirmIdentityScreen = () => {
  const router = useRouter();
  const pending = usePendingReverification();
  // The ask this sheet opened on, kept while it slides away once answered;
  // a later ask gets a sheet of its own.
  // oxlint-disable-next-line react/hook-use-state -- frozen on purpose, never set
  const [reverification] = useState(pending);

  const handleDone = useCallback(
    (answer: "cancel" | "complete") => {
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

      return;
    }

    // Swiped away without an answer: cancel. Settling twice is a no-op.
    return () => settleReverification(reverification.id, "cancel");
  }, [reverification, router]);

  if (!reverification) {
    return null;
  }

  return (
    <ConfirmIdentityView onDone={handleDone} reverification={reverification} />
  );
};

export default ConfirmIdentityScreen;
