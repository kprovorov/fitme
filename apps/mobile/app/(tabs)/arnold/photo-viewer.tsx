import { useUser } from "@clerk/expo";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { SentPhotosView } from "@/components/chat";
import { sentAttachmentUri } from "~/lib/arnold-sent-attachments";

/**
 * One message's Attachments, as large as the Screen holds (ADR 0018):
 * tapping a sent photo in the Conversation opens them here, in the order
 * they were sent, to swipe between and pinch-zoom.
 *
 * It takes the copies' names rather than their paths, and finds each one on
 * this device itself (`sentAttachmentUri`), so where a copy lives stays in
 * one module and no file path travels through a route.
 *
 * Every Attachment the message carried gets its page, including the ones
 * this device has no copy for, which show the Photo tile their bubble
 * showed: a photo is then always the number its bubble gave it, and the one
 * that was tapped is always the one that opens, whichever copies this device
 * is missing and whether or not one is lost between the tap and this Screen.
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
  const sent = useMemo(() => names.split(","), [names]);

  const photos = useMemo(
    () =>
      sent.map((name, index) => {
        const uri = userId
          ? sentAttachmentUri(userId, session, name)
          : undefined;

        // The place is part of the id because an Attachment eve never named
        // has nothing else to be told apart by, as in the bubble.
        return uri === undefined
          ? { id: `${index}:${name}` }
          : { id: `${index}:${name}`, uri };
      }),
    [sent, session, userId]
  );

  const openedAt = sent.indexOf(open);
  const initialIndex = openedAt === -1 ? 0 : openedAt;
  const [page, setPage] = useState(initialIndex);

  // Its place among the message's photos, exactly as the bubble's thumbnail
  // reads it, so VoiceOver says the same thing in both; one photo on its own
  // has no place to give.
  const labelFor = useCallback(
    (index: number) =>
      sent.length > 1
        ? t("arnold.attachments.sentPhoto", {
            position: index + 1,
            total: sent.length,
          })
        : t("arnold.attachments.viewer.image"),
    [sent.length, t]
  );

  return (
    <>
      <Stack.Screen
        options={{
          // Not transparent, unlike the rest of this stack: the photos sit
          // below the header rather than under it, so a screenshot of a
          // phone, which is the shape of the screen and so fills it, keeps
          // its first lines instead of losing them behind the chrome.
          headerTransparent: false,
          title: labelFor(page),
          // Top left, where a viewer opened over something else closes
          // (QuickLook's and Mail's Done), not where this stack's sheets put
          // their ✓.
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
          photos={photos}
        />
      </View>
    </>
  );
};

export default PhotoViewerScreen;
