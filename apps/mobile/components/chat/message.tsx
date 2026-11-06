import type { ReactNode } from "react";
import { Text } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { z } from "zod";

import { ChatMarkdown } from "@/components/markdown";

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
 * Renders markdown content for an assistant message. Wraps `<ChatMarkdown />`
 * with appropriate defaults.
 */
export const MessageResponse = ({ children }: { children: string }) => (
  <ChatMarkdown>{children || "..."}</ChatMarkdown>
);
