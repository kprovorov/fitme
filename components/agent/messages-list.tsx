import { ThreadPrimitive } from "@assistant-ui/react-native";
import { KeyboardGestureArea } from "react-native-keyboard-controller";
import { AssistantMessage, UserMessage } from "./message";

export default function MessagesList() {
  return (
    <KeyboardGestureArea
      interpolator="ios"
      style={{ flex: 1 }}
      textInputNativeID="chat-input"
    >
      <ThreadPrimitive.Messages
        components={{
          UserMessage,
          AssistantMessage,
        }}
      />
    </KeyboardGestureArea>
  );
}
