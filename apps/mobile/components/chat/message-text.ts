import type {
  TextMessagePart,
  ThreadMessage,
} from "@assistant-ui/react-native";

/** A message's text parts joined, as one string. */
export const messageText = (message: ThreadMessage): string =>
  message.content
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .join("");
