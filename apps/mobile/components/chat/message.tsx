import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { z } from "zod";

import { ChatMarkdown } from "@/components/markdown";
import { SymbolImage } from "@/components/symbol-image";
import { Image } from "@/components/tw";
import type { ShownAttachment, ShownUserMessage } from "~/lib/arnold-chat";
import { cn } from "~/lib/utils";

/**
 * Wrapper for a single chat message. Styles automatically based on the sender
 * role – user messages render as right-aligned bubbles in the primary color,
 * assistant messages render full-width.
 */
export const Message = ({
  from,
  children,
}: {
  from: "user" | "assistant";
  children: ReactNode;
}) => {
  if (from === "user") {
    const text = z.string().safeParse(children);

    return (
      <Animated.View
        className="bg-primary border-continuous mb-2 max-w-[80%] self-end rounded-2xl p-3"
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
      >
        {text.success ? (
          <Text className="text-body text-black dark:text-black" selectable>
            {text.data}
          </Text>
        ) : (
          children
        )}
      </Animated.View>
    );
  }

  return (
    <Animated.View
      className="mb-2"
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
    >
      {children}
    </Animated.View>
  );
};

/**
 * A sent Attachment's own thumbnail, so a test reads the photo it draws: the
 * control around it is what carries the label, since that is where VoiceOver
 * stops.
 */
export const SENT_PHOTO_IMAGE = "sent-photo-image";

/**
 * One Attachment the User sent, drawn from the copy this device kept of it
 * (ADR 0018): eve never sends an Attachment's bytes back, so the photo comes
 * off the phone rather than out of the Conversation. Without that copy
 * (another device, a reinstall, a copy the disk refused) a tile stands for
 * the photo instead, so the message still reads as one that carried one.
 *
 * A photo this device can draw opens full-screen when it's tapped; a tile
 * doesn't, since there is no photo behind it to open.
 *
 * VoiceOver reads either as the photo and its place among them.
 */
const SentAttachment = ({
  onOpen,
  position,
  total,
  uri,
}: {
  /**
   * Not `onPress`: a prop by that name is found by a press on the tile too,
   * which carries no photo to open (React Testing Library walks the tree
   * looking for the handler, and props of a component are part of it).
   */
  onOpen: () => void;
  position: number;
  total: number;
  uri?: string;
}) => {
  const { t } = useTranslation();
  // A copy that is on the device but can't be drawn (a copy the disk cut
  // short), which only loading it finds out. The tile stands for it then,
  // rather than an empty square where the photo should be.
  const [unreadable, setUnreadable] = useState(false);
  const onError = useCallback(() => setUnreadable(true), []);

  // Both forms are read the same way: what the User sent is a photo either
  // way, and a copy this phone hasn't got is nothing they did.
  const label = t("arnold.attachments.sentPhoto", { position, total });

  if (uri && !unreadable) {
    return (
      // The label and the role sit here, not on the image: VoiceOver stops
      // once, at the control that opens the photo. expo-image is left out of
      // the accessibility tree for it (its `isAccessibilityElement` is
      // `accessible ?? false`, so leaving `accessible` off is enough).
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="imagebutton"
        className="active:opacity-80"
        onPress={onOpen}
      >
        <Image
          className="border-continuous bg-background h-14 w-14 rounded-xl"
          contentFit="cover"
          onError={onError}
          source={{ uri }}
          testID={SENT_PHOTO_IMAGE}
        />
      </Pressable>
    );
  }

  return (
    <View
      accessibilityLabel={label}
      accessible
      // Exactly the thumbnail's height, since it stands in a photo's place:
      // a message whose copies are only partly on this phone lines its slots
      // up, whatever the text size. Its width is a minimum, so a language
      // whose word for it is longer (Polish's `Zdjęcie`) widens the tile
      // rather than losing letters.
      className="bg-background h-14 min-w-14 items-center justify-center gap-1 rounded-xl p-2"
      style={{ borderCurve: "continuous" }}
    >
      <SymbolImage
        className="text-muted-foreground text-title-3"
        name="photo"
      />
      <Text
        className="text-caption-2 text-muted-foreground dark:text-muted-foreground"
        // The caption is what the symbol already says, and VoiceOver reads
        // the whole tile from its label, so it scales only as far as the
        // slot holds rather than pushing the photos beside it out of line.
        maxFontSizeMultiplier={1.2}
        numberOfLines={1}
      >
        {t("arnold.attachments.photo")}
      </Text>
    </View>
  );
};

/**
 * What a message of the User's holds: its Attachments as thumbnails, in the
 * order they were sent, then the text they wrote. A photo sent on its own
 * has no text, so the bubble holds the photo and no empty line.
 *
 * Tapping one opens the message's photos full-screen, which is why the whole
 * list and the place tapped go back: the viewer shows the message's photos,
 * not the one photo.
 *
 * A message's four (`MAX_ATTACHMENTS_PER_MESSAGE`) just fit one row inside
 * the bubble on the narrowest supported iPhone, with about 2 pt to spare, so
 * a wider slot, a wider gap or more padding around the list wraps the last
 * one onto a row of its own; the row wraps rather than overflow either way.
 */
export const UserMessageBody = ({
  attachments,
  onOpenAttachment,
  text,
}: ShownUserMessage & {
  /** Opens the viewer on this message's photos, at the one tapped. */
  onOpenAttachment?: (
    attachments: readonly ShownAttachment[],
    index: number
  ) => void;
}) => (
  <>
    {attachments.length > 0 ? (
      <View className={cn("flex-row flex-wrap gap-2", text && "mb-2")}>
        {attachments.map((attachment, index) => (
          <SentAttachment
            key={attachment.id}
            onOpen={() => onOpenAttachment?.(attachments, index)}
            position={index + 1}
            total={attachments.length}
            uri={attachment.uri}
          />
        ))}
      </View>
    ) : null}
    {text ? (
      <Text className="text-body text-black dark:text-black" selectable>
        {text}
      </Text>
    ) : null}
  </>
);

/**
 * Renders markdown content for an assistant message. Wraps `<ChatMarkdown />`
 * with appropriate defaults.
 */
export const MessageResponse = ({ children }: { children: string }) => (
  <ChatMarkdown>{children || "..."}</ChatMarkdown>
);
