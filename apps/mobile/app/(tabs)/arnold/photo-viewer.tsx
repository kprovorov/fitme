import { useUser } from "@clerk/expo";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { SentPhotosView } from "@/components/chat";
import { sentAttachmentUri } from "~/lib/arnold-sent-attachments";

/**
 * One Attachment of a message, full-screen (ADR 0018): tapping a sent photo
 * in the Conversation opens its message's photos here, in the order they
 * were sent, to swipe between and pinch-zoom.
 *
 * It takes the copies' names rather than their paths, and finds each one on
 * this device itself (`sentAttachmentUri`), so where a copy lives stays in
 * one module and no file path travels through a route. A name this device
 * hasn't got a copy for is left out: a bubble only makes a photo it could
 * draw tappable, so the opened one is always there, and a copy that goes
 * between the tap and this Screen leaves the viewer saying so.
 */
const PhotoViewerScreen = () => {
  const { user } = useUser();
  const router = useRouter();
  const { t } = useTranslation();

  const {
    names = "",
    open = "",
    session,
  } = useLocalSearchParams<{
    /** The message's Attachments, by their device copies' names, in order. */
    names?: string;
    /** The one that was tapped, which the viewer opens on. */
    open?: string;
    /** The Conversation the message was sent in; absent before eve named it. */
    session?: string;
  }>();

  const userId = user?.id;

  const photos = useMemo(() => {
    if (!userId) {
      return [];
    }

    return names.split(",").flatMap((name) => {
      const uri = sentAttachmentUri(userId, session, name);

      return uri === undefined ? [] : [{ name, uri }];
    });
  }, [names, session, userId]);

  const openedAt = photos.findIndex((photo) => photo.name === open);
  const initialIndex = openedAt === -1 ? 0 : openedAt;
  const [page, setPage] = useState(initialIndex);

  // Its place among them, as the bubble's thumbnail reads it, so VoiceOver
  // says the same thing here; one photo on its own has no place to give.
  const labelFor = useCallback(
    (index: number) =>
      photos.length > 1
        ? t("arnold.attachments.sentPhoto", {
            position: index + 1,
            total: photos.length,
          })
        : t("arnold.attachments.viewer.image"),
    [photos.length, t]
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          title: labelFor(page),
          unstable_headerLeftItems: () => [
            {
              accessibilityLabel: t("arnold.attachments.viewer.close"),
              icon: { name: "xmark", type: "sfSymbol" },
              label: t("arnold.attachments.viewer.close"),
              onPress: () => router.back(),
              type: "button",
            },
          ],
        }}
      />
      <View className="bg-background flex-1">
        <SentPhotosView
          initialIndex={initialIndex}
          labelFor={labelFor}
          onPageChange={setPage}
          uris={photos.map((photo) => photo.uri)}
        />
      </View>
    </>
  );
};

export default PhotoViewerScreen;
