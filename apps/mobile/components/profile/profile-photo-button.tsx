import { useUser } from "@clerk/expo";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Image } from "~/components/image";
import { SymbolImage } from "~/components/symbol-image";

/** The photo's testID, for the tests that fail its load. */
export const PROFILE_PHOTO_IMAGE = "profile-photo-image";

/**
 * The Profile photo the Home header's Profile button can show: Clerk's
 * `user.imageUrl` (the User's photo, or Clerk's default picture without one),
 * once Clerk has loaded and until that URL fails to load. `uri` is `null`
 * otherwise, and the button is then the `person.fill` symbol. A failure is
 * remembered by its URL, so a new photo is tried again.
 */
export const useProfilePhoto = () => {
  const { isLoaded, user } = useUser();
  const [failedUri, setFailedUri] = useState<string | null>(null);

  const imageUrl = isLoaded ? user?.imageUrl : undefined;
  const uri = imageUrl && imageUrl !== failedUri ? imageUrl : null;

  const handleError = useCallback(() => {
    setFailedUri(uri);
  }, [uri]);

  return { handleError, uri };
};

interface ProfilePhotoButtonProps {
  readonly onError: () => void;
  readonly onPress: () => void;
  readonly uri: string;
}

/**
 * The Profile button with the User's Profile photo in a circle, the size of
 * the header's own symbol button. The `person.fill` symbol sits behind the
 * photo, so the button reads as Profile until the photo has drawn.
 */
export const ProfilePhotoButton = ({
  onError,
  onPress,
  uri,
}: ProfilePhotoButtonProps) => {
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityLabel={t("profile.title")}
      accessibilityRole="button"
      className="bg-secondary size-9 items-center justify-center overflow-hidden rounded-full"
      hitSlop={4}
      onPress={onPress}
      testID="profile-photo-button"
    >
      <SymbolImage className="text-body text-foreground" name="person.fill" />
      <View className="absolute inset-0">
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          className="size-full"
          contentFit="cover"
          onError={onError}
          source={{ uri }}
          testID={PROFILE_PHOTO_IMAGE}
          transition={150}
        />
      </View>
    </Pressable>
  );
};
