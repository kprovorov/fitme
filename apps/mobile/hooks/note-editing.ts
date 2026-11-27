import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";

/**
 * A 429's wait, in seconds, while it lasts: `null` once it has passed. Kept
 * apart from the editor, so closing and reopening it doesn't skip it.
 */
export const useNoteRateLimitWait = () => {
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (waitSeconds === null) {
      return;
    }

    const timer = setTimeout(() => {
      setWaitSeconds(null);
    }, waitSeconds * 1000);

    return () => {
      clearTimeout(timer);
    };
  }, [waitSeconds]);

  return [waitSeconds, setWaitSeconds] as const;
};

/** "Discard your note?": `discard` runs once the User says so. */
export const useAskToDiscardNote = () => {
  const { t } = useTranslation();

  return useCallback(
    (discard: () => void) => {
      Alert.alert(t("notes.discard.title"), t("notes.discard.message"), [
        { style: "cancel", text: t("notes.discard.keepEditing") },
        {
          onPress: discard,
          style: "destructive",
          text: t("notes.discard.discard"),
        },
      ]);
    },
    [t]
  );
};
