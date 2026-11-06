import { rateLimitedFor } from "@fitme/api-client";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";

interface SessionLoadErrorProps {
  /** The failed read's error: a 429 shows its wait instead of `message`. */
  error: unknown;
  /** The screen's own load error. */
  message: string;
  onRetry: () => void;
}

/**
 * A Workout Session screen's read failing with nothing to show: the screen's
 * load error (or the wait, rate limited) and Try again.
 */
const SessionLoadError = ({
  error,
  message,
  onRetry,
}: SessionLoadErrorProps) => {
  const { t } = useTranslation();
  const waitSeconds = rateLimitedFor(error);

  return (
    <View className="gap-sm pt-lg items-center">
      <Text className="text-center" variant="muted">
        {waitSeconds === null
          ? message
          : t("common.rateLimited", { seconds: waitSeconds })}
      </Text>
      <Button
        fill={false}
        label={t("common.tryAgain")}
        onPress={onRetry}
        variant="secondary"
      />
    </View>
  );
};

export default SessionLoadError;
