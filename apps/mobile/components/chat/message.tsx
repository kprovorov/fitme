import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { z } from "zod";

import { ChatMarkdown } from "@/components/markdown";
import { SymbolImage } from "@/components/symbol-image";
import type { ShownUserMessage } from "~/lib/arnold-chat";
import { cn } from "~/lib/utils";

/**
 * Wrapper for a single chat message. Styles automatically based on the sender
 * role – user messages render as right-aligned blue bubbles, assistant messages
 * render full-width.
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
 * One Attachment the User sent, as a tile standing for the photo itself:
 * eve never sends an Attachment's bytes back, and this device's own copy of
 * it is a later ticket's, so the bubble says a photo was sent without
 * showing it. VoiceOver reads the tile and its place among them.
 */
const SentAttachment = ({
  position,
  total,
}: {
  position: number;
  total: number;
}) => {
  const { t } = useTranslation();

  return (
    <View
      accessibilityLabel={t("arnold.attachments.sentPhoto", {
        position,
        total,
      })}
      accessible
      className="bg-background h-16 w-16 items-center justify-center gap-1 rounded-xl"
      style={{ borderCurve: "continuous" }}
    >
      <SymbolImage
        className="text-muted-foreground text-title-3"
        name="photo"
      />
      <Text className="text-caption-2 text-muted-foreground dark:text-muted-foreground">
        {t("arnold.attachments.photo")}
      </Text>
    </View>
  );
};

/**
 * What a message of the User's holds: a tile per Attachment it carried, then
 * the text they wrote. A photo sent on its own has no text to show.
 */
export const UserMessageBody = ({
  attachmentCount,
  text,
}: ShownUserMessage) => (
  <>
    {attachmentCount > 0 ? (
      <View className={cn("flex-row flex-wrap gap-2", text && "mb-2")}>
        {Array.from({ length: attachmentCount }, (_, index) => (
          <SentAttachment
            // biome-ignore lint/suspicious/noArrayIndexKey: identical tiles with nothing of their own to be keyed by
            key={index}
            position={index + 1}
            total={attachmentCount}
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
