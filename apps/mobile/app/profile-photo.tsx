import { useUser } from "@clerk/expo";
import { captureException } from "@sentry/react-native";
import { Stack, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, BackHandler, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScopedVariables } from "uniwind";

import { AndroidGrabber } from "@/components/grabber";
import { Button } from "~/components/ui/button";
import { GLASS_ENABLED } from "~/components/ui/swift-ui";
import {
  pickSquareLibraryPhoto,
  readAttachmentDataUrl,
  takeSquarePhoto,
} from "~/lib/arnold-attachment-picker";
import type { PickedImage } from "~/lib/arnold-attachment-picker";
import { openAppSettings } from "~/lib/external-links";
// The app's instance, named so it's started wherever the sheet renders.
import { i18n } from "~/lib/i18n";
import { cn } from "~/lib/utils";

/** Which of the sheet's actions is running, so its button spins. */
type Busy = "camera" | "library" | "remove" | null;

/**
 * The Profile Photo sheet, opened from Edit Profile's photo: Choose from
 * Library, Take Photo, Remove Photo and Cancel.
 *
 * The Profile photo is the User's Clerk image, so a new one is uploaded to
 * Clerk at once (`setProfileImage`), apart from Edit Profile's Save, and
 * every screen showing `user.imageUrl` follows. Both picks come back cropped
 * square and re-encoded without EXIF (`arnold-attachment-picker.ts`), and go
 * up as the JPEG's `data:` URL, which is what Clerk takes from React Native.
 *
 * A cancelled pick leaves the sheet as it was; a failed one, or a failed
 * upload or removal, keeps the old photo, says so and is reported. Remove
 * Photo is only offered for a photo of the User's own: Clerk's default
 * picture has nothing to remove.
 */
const ProfilePhotoSheet = () => {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation(undefined, { i18n });
  const { user } = useUser();
  const [busy, setBusy] = useState<Busy>(null);

  const showFailure = useCallback(
    (kind: "removeFailed" | "uploadFailed", error: unknown) => {
      captureException(error);
      Alert.alert(
        t(`profilePhoto.${kind}.title`),
        t(`profilePhoto.${kind}.message`)
      );
    },
    [t]
  );

  /** Uploads the picked photo as the User's, then closes the sheet. */
  const upload = useCallback(
    async (image: PickedImage) => {
      // Signed out while the picker was up: there's no one to upload for,
      // which the caller says as the failed upload it is.
      if (!user) {
        throw new Error("No signed-in User to upload the Profile photo for");
      }

      await user.setProfileImage({
        file: await readAttachmentDataUrl(image.uri),
      });
      router.back();
    },
    [router, user]
  );

  const chooseFromLibrary = useCallback(async () => {
    setBusy("library");

    try {
      const image = await pickSquareLibraryPhoto();

      // Cancelled: nothing picked, so nothing changes.
      if (image) {
        await upload(image);
      }
    } catch (error) {
      showFailure("uploadFailed", error);
    }

    setBusy(null);
  }, [showFailure, upload]);

  const takePhoto = useCallback(async () => {
    setBusy("camera");

    try {
      const photo = await takeSquarePhoto();

      if (photo.status === "denied") {
        // iOS only asks once, so the alert takes the User where they can
        // turn camera access back on.
        Alert.alert(
          t("profilePhoto.cameraDenied.title"),
          t("profilePhoto.cameraDenied.message"),
          [
            { style: "cancel", text: t("common.cancel") },
            {
              onPress: () => {
                void openAppSettings();
              },
              text: t("profilePhoto.cameraDenied.openSettings"),
            },
          ]
        );
      } else if (photo.status === "taken") {
        await upload(photo.image);
      }
      // Cancelled: nothing taken, so nothing changes.
    } catch (error) {
      // No camera (the simulator), a photo the re-encoder can't read, or
      // the upload failing.
      showFailure("uploadFailed", error);
    }

    setBusy(null);
  }, [showFailure, t, upload]);

  const removePhoto = useCallback(async () => {
    if (!user) {
      return;
    }

    setBusy("remove");

    try {
      await user.setProfileImage({ file: null });
      router.back();
    } catch (error) {
      showFailure("removeFailed", error);
    }

    setBusy(null);
  }, [router, showFailure, user]);

  const close = useCallback(() => router.back(), [router]);

  const isBusy = busy !== null;

  // Android's Back would close the sheet mid-upload as a swipe would, and
  // the upload's own `router.back()` would then pop Edit Profile: it's
  // swallowed until the pick, upload or removal settles.
  useEffect(() => {
    if (!isBusy) {
      return;
    }

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true
    );

    return () => subscription.remove();
  }, [isBusy]);

  return (
    <ScopedVariables
      variables={{
        "--photo-sheet-bottom": insets.bottom,
        "--photo-sheet-top": headerHeight,
      }}
    >
      <Stack.Screen
        options={{
          // Never swiped away mid-upload: its `router.back()` would then pop
          // Edit Profile instead.
          gestureEnabled: !isBusy,
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          title: t("profilePhoto.title"),
        }}
      />
      <View
        className={cn(
          // iOS floats the sheet above the home indicator itself.
          process.env.EXPO_OS === "android" && "pb-(--photo-sheet-bottom)",
          GLASS_ENABLED && "pt-(--photo-sheet-top)"
        )}
      >
        <AndroidGrabber />
        <View className="px-md gap-3 pt-2 pb-2">
          <Button
            disabled={isBusy}
            isLoading={busy === "library"}
            label={t("profilePhoto.chooseFromLibrary")}
            onPress={() => {
              void chooseFromLibrary();
            }}
            size="lg"
            testID="profile-photo-library"
            variant="secondary"
          />
          <Button
            disabled={isBusy}
            isLoading={busy === "camera"}
            label={t("profilePhoto.takePhoto")}
            onPress={() => {
              void takePhoto();
            }}
            size="lg"
            testID="profile-photo-camera"
            variant="secondary"
          />
          {user?.hasImage ? (
            <Button
              disabled={isBusy}
              isLoading={busy === "remove"}
              label={t("profilePhoto.removePhoto")}
              onPress={() => {
                void removePhoto();
              }}
              size="lg"
              testID="profile-photo-remove"
              variant="destructive"
            />
          ) : null}
          <Button
            contentColorClassName="text-primary"
            disabled={isBusy}
            // Centred under the pills, as the frame has it: a ghost button
            // otherwise hugs its label at the start.
            fill
            label={t("common.cancel")}
            onPress={close}
            size="lg"
            testID="profile-photo-cancel"
            variant="ghost"
          />
        </View>
      </View>
    </ScopedVariables>
  );
};

export default ProfilePhotoSheet;
