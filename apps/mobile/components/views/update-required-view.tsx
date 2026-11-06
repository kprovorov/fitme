import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";

import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { openUrl } from "~/lib/external-links";

/** The app's App Store or Play Store listing, if the platform has one. */
const getStoreUrl = () => {
  const { expoConfig } = Constants;

  if (Platform.OS === "ios") {
    return expoConfig?.ios?.appStoreUrl;
  }

  if (Platform.OS === "android" && expoConfig?.android?.package) {
    return `https://play.google.com/store/apps/details?id=${expoConfig.android.package}`;
  }
};

const STORE_URL = getStoreUrl();

const openStore = () => {
  if (STORE_URL) {
    openUrl(STORE_URL);
  }
};

/** Blocking screen for a build older than the minimum supported version. */
const UpdateRequiredView = () => {
  const { t } = useTranslation();

  return (
    <View className="bg-background p-lg flex-1">
      <VStack className="flex-1">
        <H3 className="text-center">{t("updateRequired.title")}</H3>
        <Text className="text-center" variant="muted">
          {t("updateRequired.description")}
        </Text>
        {STORE_URL ? (
          <Button
            icon="arrow.down.app"
            iconPosition="trailing"
            label={t("updateRequired.update")}
            onPress={openStore}
          />
        ) : null}
      </VStack>
    </View>
  );
};

export default UpdateRequiredView;
