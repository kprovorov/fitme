import { ThreadPrimitive } from "@assistant-ui/react-native";
import { KeyboardAvoidingView, Platform } from "react-native";
import { Composer } from "./composer";
import { AssistantMessage, UserMessage } from "./message";

export function ChatScreen() {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <ThreadPrimitive.Root style={{ flex: 1 }}>
        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />
        <Composer />
      </ThreadPrimitive.Root>
    </KeyboardAvoidingView>
  );
}
