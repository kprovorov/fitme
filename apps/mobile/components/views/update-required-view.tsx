import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { Linking, Platform } from "react-native";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";

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
    Linking.openURL(STORE_URL).catch(Sentry.captureException);
  }
};

/** Blocking screen for a build older than the minimum supported version. */
export default function UpdateRequiredView() {
  return (
    <VStack className="flex-1 items-center justify-center gap-4 bg-background p-lg">
      <H3 className="text-center">Update required</H3>
      <Text className="text-center text-body-emphasized text-muted-foreground">
        This version of Fitme is no longer supported. Update the app to keep
        training.
      </Text>
      {STORE_URL ? (
        <Button
          icon="arrow.down.app"
          iconPosition="trailing"
          label="Update"
          onPress={openStore}
        />
      ) : null}
    </VStack>
  );
}
