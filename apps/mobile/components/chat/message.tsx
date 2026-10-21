import type { ReactNode } from "react";
import { Text } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { ChatMarkdown } from "@/components/markdown";

/**
 * Wrapper for a single chat message. Styles automatically based on the sender
 * role – user messages render as right-aligned blue bubbles, assistant messages
 * render full-width.
 */
export function Message({
  from,
  children,
}: {
  from: "user" | "assistant";
  children: ReactNode;
}) {
  if (from === "user") {
    return (
      <Animated.View
        className="mb-2 max-w-[80%] self-end rounded-2xl bg-primary p-3 dark:bg-user-bubble"
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        style={{ borderCurve: "continuous" }}
      >
        {typeof children === "string" ? (
          <Text className="text-black text-body dark:text-black" selectable>
            {children}
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
}

/**
 * Renders markdown content for an assistant message. Wraps `<ChatMarkdown />`
 * with appropriate defaults.
 */
export function MessageResponse({ children }: { children: string }) {
  return <ChatMarkdown>{children || "..."}</ChatMarkdown>;
}
