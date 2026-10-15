import type {
  TextMessagePart,
  ThreadMessage,
} from "@assistant-ui/react-native";

/** A message's text parts joined, as one string. */
export function messageText(message: ThreadMessage): string {
  return message.content
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .join("");
}
